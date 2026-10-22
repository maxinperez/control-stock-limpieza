import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from './supabase'
import { enqueue, flush, getPending, getRechazadas, limpiarRechazadas } from './offline'

// Clases: cola {vacía, con datos, corrupta} · envío {sin pendientes, éxito, error del servidor}

const mov = (id) => ({ id, conteo_id: 'c1', producto_id: 'p1', cantidad: 1, usuario_id: 'u1' })
const mockUpsert = (resultado) => {
  const upsert = vi.fn().mockResolvedValue(resultado)
  supabase.from.mockReturnValue({ upsert })
  return upsert
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('cola de cargas pendientes', () => {
  it('vacía al inicio', () => expect(getPending()).toEqual([]))
  it('enqueue acumula en orden', () => {
    enqueue(mov('a')); enqueue(mov('b'))
    expect(getPending().map((m) => m.id)).toEqual(['a', 'b'])
  })
  it('contenido corrupto se trata como cola vacía', () => {
    localStorage.setItem('cs_pending', '{no es json')
    expect(getPending()).toEqual([])
  })
})

describe('flush', () => {
  it('sin pendientes no llama al servidor', async () => {
    expect(await flush()).toEqual({ sent: 0, left: 0, rechazadas: 0 })
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('éxito: envía con id único (sin duplicar) y vacía la cola', async () => {
    enqueue(mov('a')); enqueue(mov('b'))
    const upsert = mockUpsert({ error: null })
    const r = await flush()
    expect(r).toEqual({ sent: 2, left: 0, rechazadas: 0 })
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id', ignoreDuplicates: true })
    expect(getPending()).toEqual([])
  })
  it('error del servidor: conserva la cola y devuelve el error', async () => {
    enqueue(mov('a'))
    mockUpsert({ error: { message: 'sin conexión' } })
    const r = await flush()
    expect(r.error).toBe('sin conexión')
    expect(r.left).toBe(1)
    expect(getPending()).toHaveLength(1)
  })
  // Clases de error: red (sin código) · regla de la base (P0001) · permiso/RLS con el conteo cerrado (42501) ·
  // red que aparece a mitad del reintento de a una
  const upsertPorFila = (resultadoDe) => {
    const upsert = vi.fn().mockImplementation(async (filas) =>
      (filas.length > 1 ? { error: { code: 'P0001', message: 'lote rechazado' } } : resultadoDe(filas[0])))
    supabase.from.mockReturnValue({ upsert })
    return upsert
  }
  beforeEach(() => limpiarRechazadas())

  it('lote con una carga rechazada por una regla: envía el resto y descarta solo esa', async () => {
    enqueue(mov('ok1')); enqueue(mov('mala')); enqueue(mov('ok2'))
    const upsert = upsertPorFila((f) => (f.id === 'mala' ? { error: { code: 'P0001', message: 'No se puede restar más de lo contado (3)' } } : { error: null }))
    const r = await flush()
    expect(r).toEqual({ sent: 2, left: 0, rechazadas: 1 })
    expect(upsert).toHaveBeenCalledTimes(4) // el lote + una por carga
    expect(getPending()).toEqual([])
    expect(getRechazadas()).toBe(1)
  })
  it('conteo ya cerrado (RLS 42501): todas se descartan y se informan', async () => {
    enqueue(mov('a')); enqueue(mov('b'))
    mockUpsert({ error: { code: '42501', message: 'new row violates row-level security policy' } })
    const r = await flush()
    expect(r).toMatchObject({ sent: 0, left: 0, rechazadas: 2 })
    expect(getRechazadas()).toBe(2)
  })
  it('error de red a mitad del reintento: conserva las que faltan', async () => {
    enqueue(mov('ok')); enqueue(mov('red')); enqueue(mov('otra'))
    upsertPorFila((f) => (f.id === 'red' ? { error: { message: 'Failed to fetch' } } : { error: null }))
    const r = await flush()
    expect(r).toMatchObject({ sent: 1, rechazadas: 0, error: 'Failed to fetch' })
    expect(getPending().map((m) => m.id)).toEqual(['red', 'otra'])
  })
  it('las rechazadas se acumulan entre envíos hasta limpiarlas', async () => {
    enqueue(mov('a'))
    mockUpsert({ error: { code: 'P0001', message: 'x' } })
    await flush()
    enqueue(mov('b'))
    await flush()
    expect(getRechazadas()).toBe(2)
    limpiarRechazadas()
    expect(getRechazadas()).toBe(0)
  })

  it('una carga agregada durante el envío no se pierde', async () => {
    enqueue(mov('a'))
    supabase.from.mockReturnValue({
      upsert: vi.fn().mockImplementation(async () => { enqueue(mov('b')); return { error: null } }),
    })
    const r = await flush()
    expect(r.left).toBe(1)
    expect(getPending().map((m) => m.id)).toEqual(['b'])
  })
})

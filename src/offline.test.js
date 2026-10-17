import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from './supabase'
import { enqueue, flush, getPending } from './offline'

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
    expect(await flush()).toEqual({ sent: 0, left: 0 })
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('éxito: envía con id único (sin duplicar) y vacía la cola', async () => {
    enqueue(mov('a')); enqueue(mov('b'))
    const upsert = mockUpsert({ error: null })
    const r = await flush()
    expect(r).toEqual({ sent: 2, left: 0 })
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

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Respuestas simuladas de Supabase.
//   abierto: conteo abierto (o null) · ultimo: último cerrado · resumen: filas de conteo_resumen por conteo
//   upsert: resultado de enviar cargas
const resp = { abierto: null, ultimo: null, resumen: {}, upsert: { error: null } }
const mockUpsert = vi.fn()
vi.mock('../supabase', () => {
  const consulta = (tabla) => {
    const st = { estado: null, conteo: null }
    const o = {
      select: () => o, order: () => o, limit: () => o, range: () => o,
      eq: (col, val) => { if (col === 'estado') st.estado = val; if (col === 'conteo_id') st.conteo = val; return o },
      maybeSingle: () => Promise.resolve({ data: st.estado === 'abierto' ? resp.abierto : resp.ultimo, error: null }),
      upsert: (...args) => { mockUpsert(...args); return Promise.resolve(resp.upsert) },
      then: (ok, no) => Promise.resolve({ data: tabla === 'conteo_resumen' ? (resp.resumen[st.conteo] ?? []) : [], error: null }).then(ok, no),
    }
    return o
  }
  const canal = { on: () => canal, subscribe: () => canal }
  return { supabase: { from: consulta, rpc: vi.fn(), channel: () => canal, removeChannel: vi.fn() } }
})

import { supabase } from '../supabase'
import Conteo from './Conteo'

const admin = { id: 'u1', rol: 'admin', nombre: 'admin' }
const contador = { id: 'u2', rol: 'contador', nombre: 'juan' }
const abierto = { id: 'c1', nombre: 'Conteo 21/10/2026 · AB12CD', estado: 'abierto' }
const fila = (o = {}) => ({ conteo_id: 'c1', producto_id: 'p1', nombre: 'esp rosa', unidad: 'un', contado: 0, movimientos: 0, ...o })

let contenedor, raiz
async function montar(profile = admin) {
  contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  raiz = createRoot(contenedor)
  await act(async () => { raiz.render(<Conteo profile={profile} onChange={() => {}} />) })
  await act(async () => {}) // deja terminar las consultas encadenadas
  await act(async () => {})
}
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto))
const input = (placeholder) => contenedor.querySelector(`input[placeholder="${placeholder}"]`)
async function escribir(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(el, valor); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function elegirCantidad(n) {
  const sel = contenedor.querySelector('select[aria-label="Cantidad de productos"]')
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  await act(async () => { setter.call(sel, String(n)); sel.dispatchEvent(new Event('change', { bubbles: true })) })
}
const inputsNombre = () => [...contenedor.querySelectorAll('form input')]
const click = async (texto) => { await act(async () => boton(texto).click()); await act(async () => {}) }
const cargasEnviadas = () => mockUpsert.mock.calls.flatMap(([filas]) => filas.map((f) => f.cantidad))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  vi.clearAllMocks()
  supabase.rpc.mockResolvedValue({ data: 'nuevo', error: null })
  Object.assign(resp, { abierto: null, ultimo: null, resumen: {}, upsert: { error: null } })
})
afterEach(async () => {
  await act(async () => raiz.unmount())
  contenedor.remove()
})

describe('Conteo · sin conteo abierto', () => {
  // Clases: sin conteo previo · con previo cerrado (con y sin cantidades) · nombre vacío / válido / con espacios · rol

  it('admin sin conteo previo: formulario para abrir y nada para revisar', async () => {
    await montar()
    expect(input('Ej: esp rosa')).not.toBeNull()
    expect(contenedor.textContent).not.toMatch(/Último conteo/)
  })

  it('con un conteo cerrado: se ve el resultado para revisar y el aviso de que deja de mostrarse', async () => {
    resp.ultimo = { id: 'c0', nombre: 'Conteo 20/10/2026 · AAAAAA', estado: 'cerrado', cerrado_at: '2026-10-20T18:30:00Z' }
    resp.resumen.c0 = [fila({ conteo_id: 'c0', contado: 15, movimientos: 3 })]
    await montar()
    expect(contenedor.textContent).toMatch(/Último conteo/)
    expect(contenedor.textContent).toMatch(/esp rosa/)
    expect(contenedor.textContent).toMatch(/15/)
    expect(contenedor.textContent).toMatch(/el anterior deja de mostrarse/)
  })

  it('un conteo cerrado sin cargas se muestra como no realizado', async () => {
    resp.ultimo = { id: 'c0', nombre: 'X', estado: 'cerrado', cerrado_at: '2026-10-20T18:30:00Z' }
    resp.resumen.c0 = [fila({ conteo_id: 'c0' })]
    await montar()
    expect(contenedor.textContent).toMatch(/No se realizó ningún conteo/)
  })

  it('sumar n y restar n (total 0) también se muestra como no realizado, sin el producto en 0', async () => {
    resp.ultimo = { id: 'c0', nombre: 'X', estado: 'cerrado', cerrado_at: '2026-10-20T18:30:00Z' }
    resp.resumen.c0 = [fila({ conteo_id: 'c0', contado: 0, movimientos: 2 })]
    await montar()
    expect(contenedor.textContent).toMatch(/No se realizó ningún conteo/)
    expect(contenedor.textContent).not.toMatch(/esp rosa/)
  })

  it('abrir con el nombre vacío no llama a la base y avisa', async () => {
    await montar()
    await click('Abrir conteo')
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(contenedor.textContent).toMatch(/Escribí qué vas a contar/)
  })

  it('abrir con un nombre lo envía sin espacios sobrantes', async () => {
    await montar()
    await escribir(input('Ej: esp rosa'), '  esp rosa  ')
    await click('Abrir conteo')
    expect(supabase.rpc).toHaveBeenCalledWith('abrir_conteo', { p_productos: ['esp rosa'] })
  })

  it('si la base rechaza la apertura, se muestra el motivo', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'Ya hay un conteo abierto: cerralo antes de abrir otro' } })
    await montar()
    await escribir(input('Ej: esp rosa'), 'esp rosa')
    await click('Abrir conteo')
    expect(contenedor.textContent).toMatch(/Ya hay un conteo abierto/)
  })

  it('por defecto se cuenta 1 producto', async () => {
    await montar()
    expect(contenedor.querySelector('select[aria-label="Cantidad de productos"]').value).toBe('1')
    expect(inputsNombre()).toHaveLength(1)
  })

  it('elegir 3 productos muestra 3 campos y los envía en orden', async () => {
    await montar()
    await elegirCantidad(3)
    expect(inputsNombre()).toHaveLength(3)
    await escribir(inputsNombre()[0], 'esp rosa')
    await escribir(inputsNombre()[1], ' rej azul ')
    await escribir(inputsNombre()[2], 'trapo')
    await click('Abrir conteo')
    expect(supabase.rpc).toHaveBeenCalledWith('abrir_conteo', { p_productos: ['esp rosa', 'rej azul', 'trapo'] })
  })

  it('el selector ofrece de 1 a 10 productos', async () => {
    await montar()
    const opciones = [...contenedor.querySelectorAll('select[aria-label="Cantidad de productos"] option')].map((o) => o.value)
    expect(opciones).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })

  it('bajar la cantidad conserva lo ya escrito en los primeros', async () => {
    await montar()
    await elegirCantidad(3)
    await escribir(inputsNombre()[0], 'esp rosa')
    await escribir(inputsNombre()[1], 'rej azul')
    await elegirCantidad(2)
    expect(inputsNombre().map((i) => i.value)).toEqual(['esp rosa', 'rej azul'])
  })

  it('nombres repetidos (aunque cambien mayúsculas) no se envían', async () => {
    await montar()
    await elegirCantidad(2)
    await escribir(inputsNombre()[0], 'Esp Rosa')
    await escribir(inputsNombre()[1], 'esp rosa')
    await click('Abrir conteo')
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(contenedor.textContent).toMatch(/Este nombre está repetido/)
  })

  it('con varios, un nombre vacío marca ese campo y no se envía', async () => {
    await montar()
    await elegirCantidad(2)
    await escribir(inputsNombre()[0], 'esp rosa')
    await click('Abrir conteo')
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(contenedor.textContent).toMatch(/Escribí qué vas a contar/)
  })

  it('un contador no puede abrir conteos', async () => {
    await montar(contador)
    expect(input('Ej: esp rosa')).toBeNull()
    expect(contenedor.textContent).toMatch(/Esperá a que el administrador/)
  })
})

describe('Conteo · con un conteo abierto (teclado para una mano)', () => {
  // Clases de teclado: dígitos · cero a la izquierda · borrar uno · borrar todo · tope de 5 dígitos · sin coma decimal
  // Clases de acción: sumar · restar ≤ total · restar > total · sin cantidad · rol · cierre (cancelar / confirmar / total 0)
  //                   · varios productos · carga rechazada · confirmación por vibración
  const teclear = async (digitos) => {
    for (const d of digitos) {
      const b = [...contenedor.querySelectorAll('.teclado button')].find((x) => x.textContent === d)
      await act(async () => b.click())
    }
  }
  const tecla = async (label) => act(async () => contenedor.querySelector(`.teclado [aria-label="${label}"]`).click())
  const cantidad = () => contenedor.querySelector('[aria-label="Cantidad"]').textContent
  const total = () => contenedor.querySelector('.total [aria-label="Total"]').textContent
  const nota = () => contenedor.querySelector('.total .muted').textContent

  beforeEach(() => {
    resp.abierto = abierto
    resp.resumen.c1 = [fila({ contado: 15, movimientos: 2 })]
  })

  it('muestra el producto y el total en grande, con la cantidad en 0', async () => {
    await montar()
    expect(contenedor.querySelector('.producto-nombre').textContent).toBe('esp rosa')
    expect(total()).toBe('15')
    expect(cantidad()).toBe('0')
  })

  it('sin cantidad, Sumar y Restar están deshabilitados', async () => {
    await montar()
    expect(boton('Sumar').disabled).toBe(true)
    expect(boton('Restar').disabled).toBe(true)
  })

  it('teclear 2 y 0 y Sumar envía +20, limpia la cantidad y lo confirma', async () => {
    await montar()
    await teclear('20')
    expect(cantidad()).toBe('20')
    await click('Sumar')
    expect(cargasEnviadas()).toEqual([20])
    expect(cantidad()).toBe('0')
    expect(nota()).toBe('Última carga: +20')
  })

  it('al sumar, el teléfono vibra (si puede) como confirmación', async () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    await montar()
    await teclear('3')
    await click('Sumar')
    expect(vibrate).toHaveBeenCalled()
    delete navigator.vibrate
  })

  it('restar 5 (menos que el total) envía −5', async () => {
    await montar()
    await teclear('5')
    await click('Restar')
    expect(cargasEnviadas()).toEqual([-5])
    expect(nota()).toBe('Última carga: −5')
  })

  it('restar más que el total no envía nada, avisa y conserva la cantidad', async () => {
    await montar()
    await teclear('20')
    await click('Restar')
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(contenedor.textContent).toMatch(/No podés restar más de lo contado \(15\)/)
    expect(cantidad()).toBe('20')
  })

  it('un cero a la izquierda no queda (0 y 7 = 7)', async () => {
    await montar()
    await teclear('07')
    expect(cantidad()).toBe('7')
  })

  it('⌫ borra el último dígito y C borra todo', async () => {
    await montar()
    await teclear('123')
    await tecla('Borrar')
    expect(cantidad()).toBe('12')
    await tecla('Borrar todo')
    expect(cantidad()).toBe('0')
  })

  it('la cantidad tiene un tope de 5 dígitos', async () => {
    await montar()
    await teclear('1234567')
    expect(cantidad()).toBe('12345')
  })

  it('no hay tecla de coma ni punto: no se pueden cargar decimales', async () => {
    await montar()
    const teclas = [...contenedor.querySelectorAll('.teclado button')].map((b) => b.textContent)
    expect(teclas).not.toContain(',')
    expect(teclas).not.toContain('.')
  })

  it('un contador puede sumar pero no ve "Cerrar conteo"', async () => {
    await montar(contador)
    expect(boton('Sumar')).toBeDefined()
    expect(boton('Cerrar conteo')).toBeUndefined()
  })

  it('cerrar pide confirmación; "No, volver" la cancela sin cerrar', async () => {
    await montar()
    await click('Cerrar conteo')
    expect(contenedor.querySelector('[role="dialog"]')).not.toBeNull()
    expect(contenedor.textContent).toMatch(/esp rosa: 15/)
    await click('No, volver')
    expect(contenedor.querySelector('[role="dialog"]')).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('confirmar el cierre llama a cerrar_conteo', async () => {
    await montar()
    await click('Cerrar conteo')
    await click('Sí, cerrar conteo')
    expect(supabase.rpc).toHaveBeenCalledWith('cerrar_conteo', { p_conteo: 'c1' })
  })

  it('cerrar con total 0 avisa que se cierra como no realizado', async () => {
    resp.resumen.c1 = [fila({ contado: 0, movimientos: 2 })]
    await montar()
    await click('Cerrar conteo')
    expect(contenedor.textContent).toMatch(/No se contó nada/)
    expect(contenedor.textContent).not.toMatch(/esp rosa: 0/)
  })

  it('con 2 productos: se elige cuál contar arriba y Sumar va a ese', async () => {
    resp.resumen.c1 = [fila({ contado: 15, movimientos: 2 }), fila({ producto_id: 'p2', nombre: 'rej azul', contado: 4, movimientos: 1 })]
    await montar()
    const tarjetas = [...contenedor.querySelectorAll('.selector button')]
    expect(tarjetas.map((t) => t.textContent)).toEqual(['esp rosa15', 'rej azul4'])
    expect(tarjetas[0].getAttribute('aria-selected')).toBe('true')
    await act(async () => tarjetas[1].click())
    expect(contenedor.querySelector('.producto-nombre').textContent).toBe('rej azul')
    await teclear('3')
    await click('Sumar')
    expect(mockUpsert.mock.calls[0][0][0]).toMatchObject({ producto_id: 'p2', cantidad: 3 })
    await click('Cerrar conteo')
    expect(contenedor.textContent).toMatch(/esp rosa: 15/)
    expect(contenedor.textContent).toMatch(/rej azul: 4/)
  })

  it('con un solo producto no aparece el selector', async () => {
    await montar()
    expect(contenedor.querySelector('.selector')).toBeNull()
  })

  it('cambiar de producto descarta lo tecleado para no sumárselo al otro', async () => {
    resp.resumen.c1 = [fila({ contado: 15, movimientos: 2 }), fila({ producto_id: 'p2', nombre: 'rej azul', contado: 4, movimientos: 1 })]
    await montar()
    await teclear('9')
    await act(async () => contenedor.querySelectorAll('.selector button')[1].click())
    expect(cantidad()).toBe('0')
  })

  it('si la base rechaza una carga (p. ej. otro restó antes), se avisa y se puede descartar el aviso', async () => {
    resp.upsert = { error: { code: 'P0001', message: 'No se puede restar más de lo contado (3)' } }
    await montar()
    await teclear('5')
    await click('Restar')
    expect(contenedor.textContent).toMatch(/1 carga no se guardó/)
    await click('Entendido')
    expect(contenedor.textContent).not.toMatch(/no se guardó/)
  })
})

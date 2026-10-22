import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Respuestas simuladas de Supabase: no hay conteo abierto; "ultimo" es el último cerrado.
const resp = { ultimo: null, contados: 0 }
vi.mock('../supabase', () => {
  const consulta = () => {
    const st = { estado: null, head: false }
    const o = {
      select: (_cols, opts) => { st.head = Boolean(opts?.head); return o },
      eq: (col, val) => { if (col === 'estado') st.estado = val; return o },
      order: () => o, limit: () => o, range: () => o, gt: () => o,
      maybeSingle: () => Promise.resolve({ data: st.estado === 'abierto' ? null : resp.ultimo, error: null }),
      then: (ok, no) => Promise.resolve(st.head ? { count: resp.contados, error: null } : { data: [], error: null }).then(ok, no),
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
const cerradoHoy = { id: 'c-prev', nombre: 'Conteo 18/10/2026 · AB12CD', estado: 'cerrado', cerrado_at: new Date().toISOString() }

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
const radios = () => [...contenedor.querySelectorAll('input[type=radio]')]
async function escribir(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  supabase.rpc.mockResolvedValue({ error: null })
  resp.ultimo = null
  resp.contados = 0
})
afterEach(async () => {
  await act(async () => raiz.unmount())
  contenedor.remove()
})

describe('Conteo · iniciar un conteo nuevo (admin)', () => {
  // Clases: sin conteo previo · previo sin contados · previo con contados del mismo día · previo de otro día · nombre vacío / propio · rol

  it('sin conteo previo: no hay opciones y arranca de cero con nombre automático', async () => {
    await montar()
    expect(radios()).toHaveLength(0)
    await act(async () => boton('Iniciar conteo').click())
    expect(supabase.rpc).toHaveBeenCalledWith('iniciar_conteo', { p_nombre: null, p_continuar_de: null })
  })

  it('previo sin ningún producto contado: no se ofrece continuar', async () => {
    resp.ultimo = cerradoHoy; resp.contados = 0
    await montar()
    expect(radios()).toHaveLength(0)
  })

  it('previo con contados cerrado hoy: ofrece continuar, preseleccionado, y lo envía', async () => {
    resp.ultimo = cerradoHoy; resp.contados = 3
    await montar()
    expect(radios()).toHaveLength(2)
    expect(contenedor.textContent).toMatch(/Continuar con «Conteo 18\/10\/2026 · AB12CD» \(3 productos contados\)/)
    expect(radios()[1].checked).toBe(true)
    await act(async () => boton('Iniciar conteo').click())
    expect(supabase.rpc).toHaveBeenCalledWith('iniciar_conteo', { p_nombre: null, p_continuar_de: 'c-prev' })
  })

  it('previo con contados: elegir "Empezar de cero" no continúa', async () => {
    resp.ultimo = cerradoHoy; resp.contados = 3
    await montar()
    await act(async () => radios()[0].click())
    await act(async () => boton('Iniciar conteo').click())
    expect(supabase.rpc).toHaveBeenCalledWith('iniciar_conteo', { p_nombre: null, p_continuar_de: null })
  })

  it('previo de otro día: se ofrece pero queda preseleccionado "de cero"', async () => {
    resp.ultimo = { ...cerradoHoy, cerrado_at: new Date(2020, 0, 1).toISOString() }; resp.contados = 5
    await montar()
    expect(radios()).toHaveLength(2)
    expect(radios()[0].checked).toBe(true)
    await act(async () => boton('Iniciar conteo').click())
    expect(supabase.rpc).toHaveBeenCalledWith('iniciar_conteo', { p_nombre: null, p_continuar_de: null })
  })

  it('un nombre escrito a mano se envía tal cual (sin espacios sobrantes)', async () => {
    await montar()
    await escribir(contenedor.querySelector('input[placeholder="Nombre (opcional)"]'), '  Conteo depósito  ')
    await act(async () => boton('Iniciar conteo').click())
    expect(supabase.rpc).toHaveBeenCalledWith('iniciar_conteo', { p_nombre: 'Conteo depósito', p_continuar_de: null })
  })

  it('si la base rechaza el inicio, se muestra el motivo', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'Ya hay un conteo abierto: cerralo antes de iniciar otro' } })
    await montar()
    await act(async () => boton('Iniciar conteo').click())
    expect(contenedor.textContent).toMatch(/Ya hay un conteo abierto/)
  })

  it('un contador no puede iniciar conteos ni ve opciones', async () => {
    resp.ultimo = cerradoHoy; resp.contados = 3
    await montar(contador)
    expect(boton('Iniciar conteo')).toBeUndefined()
    expect(radios()).toHaveLength(0)
    expect(contenedor.textContent).toMatch(/Esperá a que el administrador/)
  })
})

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Respuestas simuladas de Supabase, por tabla.
const respuestas = { conteos: [], conteo_resumen: [] }
vi.mock('../supabase', () => {
  const consulta = (tabla) => {
    const o = {
      select: () => o, order: () => o, eq: () => o, range: () => o,
      then: (ok, fallo) => Promise.resolve({ data: respuestas[tabla] }).then(ok, fallo),
    }
    return o
  }
  return { supabase: { from: (tabla) => consulta(tabla), rpc: vi.fn() } }
})
vi.mock('xlsx', () => ({
  utils: { book_new: vi.fn(() => ({})), json_to_sheet: vi.fn(), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}))

import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import Reportes from './Reportes'

const conteo = { id: 'c1', nombre: 'Conteo 17/10', estado: 'cerrado' }
const fila = (o = {}) => ({
  conteo_id: 'c1', producto_id: 'p1', codigo: 'A1', nombre: 'Esponja', unidad: 'un',
  stock_sistema: 10, stock_minimo: 0, contado: 0, movimientos: 0, diferencia: -10, ...o,
})

let contenedor, raiz
async function montar() {
  contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  raiz = createRoot(contenedor)
  await act(async () => { raiz.render(<Reportes />) })
  await act(async () => {}) // deja terminar las consultas
}
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto))
const botonExportar = () => boton('Exportar')

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
})
afterEach(async () => {
  await act(async () => raiz.unmount())
  contenedor.remove()
})

describe('Reportes · botón Exportar Excel', () => {
  // Clases: ningún producto contado · algún producto contado
  it('conteo con productos pero sin ninguna carga: botón deshabilitado y con aviso', async () => {
    respuestas.conteos = [conteo]
    respuestas.conteo_resumen = [fila({ movimientos: 0 })]
    await montar()
    expect(botonExportar().disabled).toBe(true)
    expect(contenedor.textContent).toMatch(/ningún producto/)
  })

  it('al hacer click con el botón deshabilitado no se genera el archivo', async () => {
    respuestas.conteos = [conteo]
    respuestas.conteo_resumen = [fila({ movimientos: 0 })]
    await montar()
    await act(async () => botonExportar().click())
    expect(XLSX.writeFile).not.toHaveBeenCalled()
  })

  it('cerrar un conteo vacío: pide confirmación avisando que está vacío y luego informa que se cerró sin productos', async () => {
    respuestas.conteos = [{ ...conteo, estado: 'abierto' }]
    respuestas.conteo_resumen = [fila({ movimientos: 0 })]
    supabase.rpc.mockResolvedValue({ error: null })
    await montar()

    await act(async () => boton('Cerrar conteo').click())
    expect(contenedor.textContent).toMatch(/Ningún producto fue contado/)
    expect(supabase.rpc).not.toHaveBeenCalled() // todavía no cerró

    await act(async () => boton('Sí, cerrar conteo').click())
    expect(supabase.rpc).toHaveBeenCalledWith('cerrar_conteo', { p_conteo: 'c1' })
    expect(contenedor.textContent).toMatch(/Conteo cerrado sin ningún producto contado/)
    expect(contenedor.textContent).not.toMatch(/Ya podés exportar/)
  })

  it('cerrar un conteo con productos contados: informa cuántos y permite exportar', async () => {
    respuestas.conteos = [{ ...conteo, estado: 'abierto' }]
    respuestas.conteo_resumen = [fila({ movimientos: 2, contado: 4 }), fila({ producto_id: 'p2', movimientos: 0 })]
    supabase.rpc.mockResolvedValue({ error: null })
    await montar()
    await act(async () => boton('Cerrar conteo').click())
    expect(contenedor.textContent).toMatch(/Queda 1 producto sin contar/)
    await act(async () => boton('Sí, cerrar conteo').click())
    expect(contenedor.textContent).toMatch(/Conteo cerrado con 1 producto contado\. Ya podés exportar/)
  })

  it('un conteo que continúa a otro muestra de cuál y avisa que se cargue solo este resultado', async () => {
    const anterior = { id: 'c0', nombre: 'Conteo 18/10/2026 · AAAAAA', estado: 'cerrado' }
    respuestas.conteos = [{ ...conteo, continua_de: 'c0' }, anterior]
    respuestas.conteo_resumen = [fila({ movimientos: 1, contado: 3 })]
    await montar()
    expect(contenedor.textContent).toMatch(/Continúa de «Conteo 18\/10\/2026 · AAAAAA»/)
    expect(contenedor.textContent).toMatch(/solo este resultado/)
  })

  it('un conteo que no continúa a otro no muestra ese aviso', async () => {
    respuestas.conteos = [conteo]
    respuestas.conteo_resumen = [fila({ movimientos: 1, contado: 3 })]
    await montar()
    expect(contenedor.textContent).not.toMatch(/Continúa de/)
  })

  it('con un producto contado: botón habilitado y genera el archivo', async () => {
    respuestas.conteos = [conteo]
    respuestas.conteo_resumen = [fila({ movimientos: 2, contado: 4, diferencia: -6 })]
    await montar()
    expect(botonExportar().disabled).toBe(false)
    await act(async () => botonExportar().click())
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1)
  })
})

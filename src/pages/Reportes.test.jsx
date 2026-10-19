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
const botonExportar = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes('Exportar'))

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

  it('con un producto contado: botón habilitado y genera el archivo', async () => {
    respuestas.conteos = [conteo]
    respuestas.conteo_resumen = [fila({ movimientos: 2, contado: 4, diferencia: -6 })]
    await montar()
    expect(botonExportar().disabled).toBe(false)
    await act(async () => botonExportar().click())
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1)
  })
})

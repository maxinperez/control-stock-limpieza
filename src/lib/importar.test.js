import { describe, expect, it } from 'vitest'
import { parseSheet } from './importar'

// Clases de equivalencia de la planilla: estructura (vacía / sin columnas obligatorias / válida),
// nombres de columna (canónicos / alias), filas (válida / incompleta), unidad, columnas opcionales.

const fila = (extra = {}) => ({ codigo: 'A1', nombre: 'Esponja', stock: 10, ...extra })

describe('parseSheet · estructura de la planilla', () => {
  it('planilla vacía: faltan codigo y nombre', () => {
    expect(parseSheet([]).missing).toEqual(['codigo', 'nombre'])
  })
  it('sin columna nombre', () => {
    expect(parseSheet([{ codigo: 'A1', stock: 1 }]).missing).toEqual(['nombre'])
  })
  it('sin columna codigo ni barcode', () => {
    expect(parseSheet([{ nombre: 'X', stock: 1 }]).missing).toEqual(['codigo'])
  })
  it('planilla válida mínima aplica valores por defecto', () => {
    const r = parseSheet([fila()])
    expect(r.missing).toEqual([])
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ codigo: 'A1', nombre: 'Esponja', unidad: 'un', stock: 10, costo: null })
  })
})

describe('parseSheet · nombres de columna', () => {
  it('alias con mayúsculas y tildes se reconocen', () => {
    const r = parseSheet([{ 'Cód': 'B2', 'Descripción': 'Lavandina', Existencia: 4, Rubro: 'Líquidos' }])
    expect(r.items[0]).toMatchObject({ codigo: 'B2', nombre: 'Lavandina', stock: 4, categoria: 'Líquidos' })
  })
})

describe('parseSheet · filas', () => {
  it('fila sin nombre se omite y se cuenta', () => {
    const r = parseSheet([fila(), fila({ codigo: 'A2', nombre: '' })])
    expect(r.items).toHaveLength(1)
    expect(r.skipped).toBe(1)
  })
  it('fila sin código usa el código de barras', () => {
    const r = parseSheet([{ codigo: '', barcode: '7790001', nombre: 'Esponja', stock: 1 }])
    expect(r.items[0].codigo).toBe('7790001')
  })
  it('stock con coma decimal se convierte', () => {
    expect(parseSheet([fila({ stock: '12,5', unidad: 'kg' })]).items[0].stock).toBe(12.5)
  })
  it('stock vacío queda en 0', () => {
    expect(parseSheet([fila({ stock: '' })]).items[0].stock).toBe(0)
  })
})

describe('parseSheet · unidad', () => {
  it('alias de unidad se normaliza', () => {
    expect(parseSheet([fila({ unidad: 'Kilos' })]).items[0].unidad).toBe('kg')
    expect(parseSheet([fila({ unidad: 'litros' })]).items[0].unidad).toBe('lt')
  })
  it('unidad desconocida: la fila no se importa y se cuenta', () => {
    const r = parseSheet([fila({ unidad: 'un' }), fila({ codigo: 'A2', unidad: 'caja' })])
    expect(r.items).toHaveLength(1)
    expect(r.unidadesInvalidas).toBe(1)
  })
})

describe('parseSheet · columnas opcionales', () => {
  it('sin columnas de mínimo/ideal no se incluyen (no pisan lo cargado en la app)', () => {
    const it = parseSheet([fila()]).items[0]
    expect('stock_minimo' in it).toBe(false)
    expect('stock_ideal' in it).toBe(false)
  })
  it('con columnas de mínimo/ideal se incluyen', () => {
    const it = parseSheet([fila({ stock_minimo: 5, stock_ideal: 20 })]).items[0]
    expect(it.stock_minimo).toBe(5)
    expect(it.stock_ideal).toBe(20)
  })
  it('mínimo vacío queda en 0 e ideal vacío en null', () => {
    const it = parseSheet([fila({ stock_minimo: '', stock_ideal: '' })]).items[0]
    expect(it.stock_minimo).toBe(0)
    expect(it.stock_ideal).toBeNull()
  })
})

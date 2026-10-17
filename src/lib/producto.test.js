import { describe, expect, it } from 'vitest'
import { validarProducto } from './producto'

// Clases de equivalencia del formulario "producto nuevo":
// código {con valor, vacío} · nombre {con valor, vacío} · unidad {válida, inválida}
// números {vacío, válido, negativo, no numérico} · stock en 'un' {entero, decimal} · ideal vs mínimo.

const ok = (extra = {}) => ({
  codigo: 'A1', nombre: 'Esponja', unidad: 'un', categoria: '', costo: '', stock: '10', stock_minimo: '2', stock_ideal: '', ...extra,
})

describe('validarProducto', () => {
  it('formulario válido devuelve valores convertidos', () => {
    const r = validarProducto(ok({ costo: '450,5', stock_ideal: '8' }))
    expect(r.ok).toBe(true)
    expect(r.valores).toMatchObject({ codigo: 'A1', nombre: 'Esponja', costo: 450.5, stock: 10, stock_minimo: 2, stock_ideal: 8 })
  })
  it('código vacío es inválido', () => expect(validarProducto(ok({ codigo: '  ' })).errores.codigo).toBeTruthy())
  it('nombre vacío es inválido', () => expect(validarProducto(ok({ nombre: '' })).errores.nombre).toBeTruthy())
  it('unidad fuera de un/kg/lt es inválida', () => expect(validarProducto(ok({ unidad: 'caja' })).errores.unidad).toBeTruthy())

  it('stock y mínimo vacíos valen 0', () => {
    const r = validarProducto(ok({ stock: '', stock_minimo: '' }))
    expect(r.ok).toBe(true)
    expect(r.valores).toMatchObject({ stock: 0, stock_minimo: 0 })
  })
  it('costo e ideal vacíos quedan null', () => {
    const r = validarProducto(ok())
    expect(r.valores.costo).toBeNull()
    expect(r.valores.stock_ideal).toBeNull()
  })
  it('número negativo es inválido', () => expect(validarProducto(ok({ stock: '-1' })).errores.stock).toBeTruthy())
  it('texto no numérico es inválido', () => expect(validarProducto(ok({ costo: 'abc' })).errores.costo).toBeTruthy())

  it('unidad un con stock decimal es inválido', () => {
    expect(validarProducto(ok({ stock: '2,5' })).errores.stock).toMatch(/enteros/)
  })
  it('kg con stock decimal es válido', () => {
    expect(validarProducto(ok({ unidad: 'kg', stock: '2,5' })).ok).toBe(true)
  })
  it('ideal menor al mínimo es inválido', () => {
    expect(validarProducto(ok({ stock_minimo: '10', stock_ideal: '5' })).errores.stock_ideal).toBeTruthy()
  })
  it('ideal igual al mínimo es válido (límite)', () => {
    expect(validarProducto(ok({ stock_minimo: '5', stock_ideal: '5' })).ok).toBe(true)
  })
  it('categoría vacía queda null', () => expect(validarProducto(ok()).valores.categoria).toBeNull())
})

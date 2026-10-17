import { describe, expect, it } from 'vitest'
import { validarProducto } from './producto'

// Clases de equivalencia del formulario "producto nuevo":
// código {con valor, vacío} · nombre {con valor, vacío} · unidad {válida, inválida}
// números {vacío, válido, negativo, no numérico} · stock en 'un' {entero, decimal}.

const ok = (extra = {}) => ({
  codigo: 'A1', nombre: 'Esponja', unidad: 'un', categoria: '', stock: '10', stock_minimo: '2', ...extra,
})

describe('validarProducto', () => {
  it('formulario válido devuelve valores convertidos', () => {
    const r = validarProducto(ok())
    expect(r.ok).toBe(true)
    expect(r.valores).toEqual({
      codigo: 'A1', nombre: 'Esponja', unidad: 'un', categoria: null, stock: 10, stock_minimo: 2,
    })
  })
  it('código vacío es inválido', () => expect(validarProducto(ok({ codigo: '  ' })).errores.codigo).toBeTruthy())
  it('nombre vacío es inválido', () => expect(validarProducto(ok({ nombre: '' })).errores.nombre).toBeTruthy())
  it('unidad fuera de un/kg/lt es inválida', () => expect(validarProducto(ok({ unidad: 'caja' })).errores.unidad).toBeTruthy())

  it('stock y mínimo vacíos valen 0', () => {
    const r = validarProducto(ok({ stock: '', stock_minimo: '' }))
    expect(r.ok).toBe(true)
    expect(r.valores).toMatchObject({ stock: 0, stock_minimo: 0 })
  })
  it('número negativo es inválido', () => expect(validarProducto(ok({ stock: '-1' })).errores.stock).toBeTruthy())
  it('mínimo negativo es inválido', () => expect(validarProducto(ok({ stock_minimo: '-3' })).errores.stock_minimo).toBeTruthy())
  it('texto no numérico es inválido', () => expect(validarProducto(ok({ stock: 'abc' })).errores.stock).toBeTruthy())
  it('stock con coma decimal se convierte', () => {
    expect(validarProducto(ok({ unidad: 'kg', stock: '2,5' })).valores.stock).toBe(2.5)
  })

  it('unidad un con stock decimal es inválido', () => {
    expect(validarProducto(ok({ stock: '2,5' })).errores.stock).toMatch(/enteros/)
  })
  it('kg con stock decimal es válido', () => {
    expect(validarProducto(ok({ unidad: 'kg', stock: '2,5' })).ok).toBe(true)
  })
  it('categoría con texto se conserva sin espacios sobrantes', () => {
    expect(validarProducto(ok({ categoria: '  Secos ' })).valores.categoria).toBe('Secos')
  })
  it('ya no existen campos de costo ni de stock ideal en el resultado', () => {
    const v = validarProducto(ok()).valores
    expect('costo' in v).toBe(false)
    expect('stock_ideal' in v).toBe(false)
  })
})

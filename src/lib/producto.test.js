import { describe, expect, it } from 'vitest'
import { aFormulario, filtrarProductos, validarProducto } from './producto'

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

describe('aFormulario (producto de la base → formulario de edición)', () => {
  // Clases: producto completo · campos nulos · números que llegan como texto desde la base
  it('producto completo', () => {
    const f = aFormulario({ codigo: 'A1', nombre: 'Esponja', unidad: 'un', categoria: 'Secos', stock_actual: 10, stock_minimo: 2 })
    expect(f).toEqual({ codigo: 'A1', nombre: 'Esponja', unidad: 'un', categoria: 'Secos', stock: '10', stock_minimo: '2' })
  })
  it('categoría nula queda vacía', () => {
    expect(aFormulario({ codigo: 'A1', nombre: 'X', unidad: 'un', categoria: null, stock_actual: 0, stock_minimo: 0 }).categoria).toBe('')
  })
  it('numéricos con ceros decimales (12.500) se muestran sin ceros sobrantes', () => {
    const f = aFormulario({ codigo: 'P', nombre: 'Jabón', unidad: 'kg', stock_actual: '12.500', stock_minimo: '5.000' })
    expect(f.stock).toBe('12.5')
    expect(f.stock_minimo).toBe('5')
  })
  it('el resultado pasa la validación del formulario', () => {
    const f = aFormulario({ codigo: 'L1', nombre: 'Lavandina', unidad: 'lt', categoria: null, stock_actual: '3.250', stock_minimo: '1.000' })
    expect(validarProducto(f).ok).toBe(true)
  })
})

describe('filtrarProductos', () => {
  const datos = [
    { id: 1, codigo: 'A1', nombre: 'Esponja', unidad: 'un', activo: true },
    { id: 2, codigo: 'L1', nombre: 'Detergente líquido', unidad: 'lt', activo: true },
    { id: 3, codigo: 'P1', nombre: 'Jabón en pasta', unidad: 'kg', activo: false },
  ]
  const ids = (r) => r.map((p) => p.id)

  // Clases: activos vs archivados · unidad · búsqueda (nombre, código, sin resultados) · límite
  it('por defecto solo muestra los activos', () => expect(ids(filtrarProductos(datos))).toEqual([1, 2]))
  it('archivados: true muestra solo los archivados', () => expect(ids(filtrarProductos(datos, { archivados: true }))).toEqual([3]))
  it('un producto sin el campo activo se considera activo', () => {
    expect(ids(filtrarProductos([{ id: 9, codigo: 'X', nombre: 'Y', unidad: 'un' }]))).toEqual([9])
  })
  it('filtra por unidad', () => expect(ids(filtrarProductos(datos, { unidad: 'lt' }))).toEqual([2]))
  it('busca por nombre ignorando tildes y mayúsculas', () => expect(ids(filtrarProductos(datos, { q: 'LIQUIDO' }))).toEqual([2]))
  it('busca por código', () => expect(ids(filtrarProductos(datos, { q: 'a1' }))).toEqual([1]))
  it('un archivado no aparece en la búsqueda de activos', () => expect(filtrarProductos(datos, { q: 'jabon' })).toEqual([]))
  it('respeta el límite', () => expect(filtrarProductos(datos, { limit: 1 })).toHaveLength(1))
})

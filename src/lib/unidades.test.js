import { describe, expect, it } from 'vitest'
import { normalizarUnidad, parseNumero, validarCantidad, validarTotal } from './unidades'

// Cada describe lista sus clases de equivalencia; cada it prueba un representante de una clase.

describe('normalizarUnidad', () => {
  // Clases: [canónica] [alias en otro formato] [vacía/ausente] [desconocida]
  it('canónica: kg, lt y un se conservan', () => {
    expect(normalizarUnidad('kg')).toBe('kg')
    expect(normalizarUnidad('lt')).toBe('lt')
    expect(normalizarUnidad('un')).toBe('un')
  })
  it('alias con mayúsculas, plural o tildes se normalizan', () => {
    expect(normalizarUnidad('KILOS')).toBe('kg')
    expect(normalizarUnidad('Litros')).toBe('lt')
    expect(normalizarUnidad(' Unidádes ')).toBe('un')
  })
  it('vacía o ausente usa unidad por defecto', () => {
    expect(normalizarUnidad('')).toBe('un')
    expect(normalizarUnidad('   ')).toBe('un')
    expect(normalizarUnidad(null)).toBe('un')
    expect(normalizarUnidad(undefined)).toBe('un')
  })
  it('desconocida devuelve null', () => {
    expect(normalizarUnidad('metro')).toBeNull()
    expect(normalizarUnidad('caja')).toBeNull()
  })
})

describe('parseNumero', () => {
  // Clases: [número] [texto con punto] [texto con coma] [vacío] [no numérico/infinito]
  it('número se devuelve igual', () => expect(parseNumero(12.5)).toBe(12.5))
  it('texto con punto decimal', () => expect(parseNumero('12.5')).toBe(12.5))
  it('texto con coma decimal', () => expect(parseNumero('12,5')).toBe(12.5))
  it('vacío o null devuelve null', () => {
    expect(parseNumero('')).toBeNull()
    expect(parseNumero(null)).toBeNull()
  })
  it('texto no numérico o infinito devuelve null', () => {
    expect(parseNumero('abc')).toBeNull()
    expect(parseNumero(Infinity)).toBeNull()
  })
})

describe('validarCantidad (cantidad a sumar)', () => {
  // Clases: unidad {un, kg/lt, inválida} × valor {entero>0, decimal≤3, decimal>3, 0, negativo, no numérico}
  it('un: entero positivo es válido', () => expect(validarCantidad('un', 5).ok).toBe(true))
  it('un: decimal es inválido', () => {
    const r = validarCantidad('un', 2.5)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/enteros/)
  })
  it('kg y lt: decimal de hasta 3 cifras es válido', () => {
    expect(validarCantidad('kg', 1.5).ok).toBe(true)
    expect(validarCantidad('lt', 0.125).ok).toBe(true)
  })
  it('kg: más de 3 decimales es inválido', () => expect(validarCantidad('kg', 1.2345).ok).toBe(false))
  it('cero es inválido para sumar', () => expect(validarCantidad('un', 0).ok).toBe(false))
  it('negativo es inválido', () => expect(validarCantidad('kg', -1).ok).toBe(false))
  it('no numérico es inválido', () => {
    expect(validarCantidad('un', NaN).ok).toBe(false)
    expect(validarCantidad('un', Infinity).ok).toBe(false)
    expect(validarCantidad('un', undefined).ok).toBe(false)
  })
  it('unidad desconocida es inválida', () => expect(validarCantidad('caja', 3).ok).toBe(false))
})

describe('validarTotal (total corregido)', () => {
  // Diferencia con validarCantidad: el 0 es un total válido
  it('cero es válido', () => expect(validarTotal('un', 0).ok).toBe(true))
  it('positivo válido según unidad', () => expect(validarTotal('lt', 2.75).ok).toBe(true))
  it('negativo es inválido', () => expect(validarTotal('un', -1).ok).toBe(false))
  it('un: decimal es inválido', () => expect(validarTotal('un', 1.5).ok).toBe(false))
})

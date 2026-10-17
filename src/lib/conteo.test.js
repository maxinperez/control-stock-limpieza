import { describe, expect, it } from 'vitest'
import { diferencias, filtrar, mergePendientes, progreso, reposicion, sinContar } from './conteo'

const row = (o = {}) => ({
  producto_id: 'p1', codigo: 'A1', barcode: null, nombre: 'Esponja', unidad: 'un',
  stock_sistema: 10, stock_minimo: 0, contado: 0, movimientos: 0, diferencia: -10, ...o,
})

describe('mergePendientes', () => {
  // Clases: sin pendientes · del mismo conteo · de otro conteo · de otro producto · corrección negativa
  it('sin pendientes deja las filas igual', () => {
    expect(mergePendientes([row({ contado: 3, movimientos: 1 })], [], 'c1')[0]).toMatchObject({ contado: 3, movimientos: 1 })
  })
  it('suma pendientes del mismo conteo y producto', () => {
    const pend = [{ conteo_id: 'c1', producto_id: 'p1', cantidad: 4 }, { conteo_id: 'c1', producto_id: 'p1', cantidad: 2 }]
    expect(mergePendientes([row({ contado: 3, movimientos: 1 })], pend, 'c1')[0]).toMatchObject({ contado: 9, movimientos: 3 })
  })
  it('ignora pendientes de otro conteo', () => {
    const pend = [{ conteo_id: 'otro', producto_id: 'p1', cantidad: 4 }]
    expect(mergePendientes([row()], pend, 'c1')[0].contado).toBe(0)
  })
  it('no afecta a otro producto', () => {
    const pend = [{ conteo_id: 'c1', producto_id: 'p2', cantidad: 4 }]
    expect(mergePendientes([row()], pend, 'c1')[0].movimientos).toBe(0)
  })
  it('una corrección negativa resta', () => {
    const pend = [{ conteo_id: 'c1', producto_id: 'p1', cantidad: -2 }]
    expect(mergePendientes([row({ contado: 5, movimientos: 1 })], pend, 'c1')[0].contado).toBe(3)
  })
  it('convierte valores numéricos que llegan como texto', () => {
    expect(mergePendientes([row({ contado: '2.5', movimientos: '1' })], [], 'c1')[0].contado).toBe(2.5)
  })
})

describe('progreso', () => {
  it('sin productos: 0%', () => expect(progreso([])).toEqual({ total: 0, hechos: 0, pct: 0 }))
  it('parcial', () => {
    const p = progreso([row({ movimientos: 1 }), row({ movimientos: 0 }), row({ movimientos: 0 }), row({ movimientos: 2 })])
    expect(p).toEqual({ total: 4, hechos: 2, pct: 50 })
  })
  it('completo: 100%', () => expect(progreso([row({ movimientos: 1 })]).pct).toBe(100))
})

describe('filtrar', () => {
  const datos = [
    row({ producto_id: 'a', nombre: 'Detergente líquido', codigo: 'L1', unidad: 'lt', movimientos: 1 }),
    row({ producto_id: 'b', nombre: 'Esponja', codigo: 'S1', unidad: 'un', movimientos: 0 }),
    row({ producto_id: 'c', nombre: 'Jabón en pasta', codigo: 'P1', unidad: 'kg', movimientos: 0, barcode: '7790' }),
  ]
  const ids = (r) => r.map((x) => x.producto_id)

  // Clases de búsqueda: vacía · coincide nombre (sin tildes/mayúsculas) · coincide código · coincide barcode · sin coincidencias
  it('búsqueda vacía devuelve todos', () => expect(ids(filtrar(datos))).toEqual(['a', 'b', 'c']))
  it('busca por nombre ignorando tildes y mayúsculas', () => expect(ids(filtrar(datos, { q: 'LIQUIDO' }))).toEqual(['a']))
  it('busca por código', () => expect(ids(filtrar(datos, { q: 's1' }))).toEqual(['b']))
  it('busca por código de barras', () => expect(ids(filtrar(datos, { q: '7790' }))).toEqual(['c']))
  it('sin coincidencias devuelve vacío', () => expect(filtrar(datos, { q: 'zzz' })).toEqual([]))

  // Clases de estado
  it('filtro pendientes', () => expect(ids(filtrar(datos, { filtro: 'pendientes' }))).toEqual(['b', 'c']))
  it('filtro contados', () => expect(ids(filtrar(datos, { filtro: 'contados' }))).toEqual(['a']))

  // Clases de unidad
  it('filtro por unidad kg', () => expect(ids(filtrar(datos, { unidad: 'kg' }))).toEqual(['c']))
  it('filtros combinados (pendientes + lt) no devuelve nada', () => {
    expect(filtrar(datos, { filtro: 'pendientes', unidad: 'lt' })).toEqual([])
  })

  it('respeta el límite', () => expect(filtrar(datos, { limit: 2 })).toHaveLength(2))
})

describe('diferencias y sinContar', () => {
  it('excluye productos sin contar y los de diferencia 0', () => {
    const rows = [
      row({ producto_id: 'a', movimientos: 1, diferencia: -3 }),
      row({ producto_id: 'b', movimientos: 1, diferencia: 0 }),
      row({ producto_id: 'c', movimientos: 0, diferencia: -10 }),
    ]
    expect(diferencias(rows).map((r) => r.producto_id)).toEqual(['a'])
    expect(sinContar(rows).map((r) => r.producto_id)).toEqual(['c'])
  })
  it('ordena de mayor a menor diferencia en valor absoluto (faltantes y sobrantes juntos)', () => {
    const rows = [
      row({ producto_id: 'chica', movimientos: 1, diferencia: 1 }),
      row({ producto_id: 'faltante', movimientos: 1, diferencia: -10 }),
      row({ producto_id: 'sobrante', movimientos: 1, diferencia: 4 }),
    ]
    expect(diferencias(rows).map((r) => r.producto_id)).toEqual(['faltante', 'sobrante', 'chica'])
  })
})

describe('reposicion', () => {
  // Clases: sin mínimo · sobre el mínimo · en el mínimo (límite) · bajo el mínimo · contado vs no contado
  it('sin stock mínimo configurado no se sugiere', () => {
    expect(reposicion([row({ stock_minimo: 0, stock_sistema: 0 })])).toEqual([])
  })
  it('sobre el mínimo no se sugiere', () => {
    expect(reposicion([row({ stock_minimo: 5, movimientos: 1, contado: 6 })])).toEqual([])
  })
  it('exactamente en el mínimo sí se sugiere (límite)', () => {
    expect(reposicion([row({ stock_minimo: 5, movimientos: 1, contado: 5 })])).toHaveLength(1)
  })
  it('usa lo contado si se contó, aunque el sistema diga otra cosa', () => {
    const r = reposicion([row({ stock_minimo: 5, stock_sistema: 50, movimientos: 1, contado: 2 })])
    expect(r[0].base).toBe(2)
  })
  it('usa el stock del sistema si no se contó', () => {
    const r = reposicion([row({ stock_minimo: 5, stock_sistema: 3, movimientos: 0 })])
    expect(r[0].base).toBe(3)
  })
  it('con stock en 0 y mínimo configurado sí se sugiere', () => {
    expect(reposicion([row({ stock_minimo: 5, movimientos: 1, contado: 0 })])).toHaveLength(1)
  })
  it('conserva los datos del producto y agrega la base usada', () => {
    const r = reposicion([row({ producto_id: 'x', nombre: 'Lavandina', unidad: 'lt', stock_minimo: 5, movimientos: 1, contado: 1.5 })])[0]
    expect(r).toMatchObject({ producto_id: 'x', nombre: 'Lavandina', unidad: 'lt', base: 1.5 })
  })
})

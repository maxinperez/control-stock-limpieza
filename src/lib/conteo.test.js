import { describe, expect, it } from 'vitest'
import {
  diferencias, filtrar, mergePendientes, opcionContinuar, progreso, puedeExportar, reposicion, sinContar,
  textoCierreHecho, textoConfirmarCierre, textoContinuar, validarMovimiento, validarNombreProducto,
  conCantidad, validarNombresProductos,
} from './conteo'

describe('validarNombresProductos (abrir un conteo con 1 a 10 productos)', () => {
  // Clases de cantidad: 0 · 1 (mínimo) · 10 (máximo) · 11 · no es lista
  // Clases de nombres: todos válidos · uno vacío · uno largo · repetido exacto · repetido por mayúsculas/espacios
  const varios = (n) => Array.from({ length: n }, (_, i) => `prod ${i + 1}`)

  it('lista vacía es inválida', () => expect(validarNombresProductos([]).error).toMatch(/Escribí/))
  it('algo que no es una lista se trata como vacía', () => expect(validarNombresProductos(undefined).ok).toBe(false))
  it('un solo producto (mínimo) es válido y se recorta', () => {
    expect(validarNombresProductos(['  esp rosa '])).toEqual({ ok: true, nombres: ['esp rosa'], errores: [null] })
  })
  it('diez productos (máximo) es válido', () => expect(validarNombresProductos(varios(10)).nombres).toHaveLength(10))
  it('once productos es inválido', () => expect(validarNombresProductos(varios(11)).error).toMatch(/hasta 10/))
  it('un nombre vacío marca solo esa posición', () => {
    const r = validarNombresProductos(['esp rosa', '  ', 'rej azul'])
    expect(r.ok).toBe(false)
    expect(r.errores[0]).toBeNull()
    expect(r.errores[1]).toMatch(/Escribí/)
    expect(r.errores[2]).toBeNull()
  })
  it('un nombre de más de 60 caracteres es inválido', () => {
    expect(validarNombresProductos(['ok', 'x'.repeat(61)]).errores[1]).toMatch(/60/)
  })
  it('repetido exacto: se marca el segundo', () => {
    const r = validarNombresProductos(['esp rosa', 'esp rosa'])
    expect(r.errores).toEqual([null, 'Este nombre está repetido'])
  })
  it('repetido con otras mayúsculas o espacios también cuenta', () => {
    expect(validarNombresProductos(['Esp Rosa', '  esp   rosa ']).ok).toBe(false)
  })
  it('nombres parecidos pero distintos son válidos', () => {
    expect(validarNombresProductos(['esp rosa', 'esp rosada']).ok).toBe(true)
  })
})

describe('conCantidad (qué cuenta como "contado" en el conteo simple)', () => {
  // Clases: sin cargas · cargas que suman 0 (sumó y restó lo mismo) · total positivo · total como texto · lista vacía
  const r = (contado, movimientos) => ({ producto_id: 'p', contado, movimientos })
  it('sin cargas no cuenta', () => expect(conCantidad([r(0, 0)])).toEqual([]))
  it('sumar n y restar n (total 0) no cuenta', () => expect(conCantidad([r(0, 2)])).toEqual([]))
  it('total positivo cuenta', () => expect(conCantidad([r(15, 2)])).toHaveLength(1))
  it('total que llega como texto desde la base', () => {
    expect(conCantidad([r('0.000', 2)])).toEqual([])
    expect(conCantidad([r('3.000', 1)])).toHaveLength(1)
  })
  it('lista vacía', () => expect(conCantidad([])).toEqual([]))
})

describe('validarNombreProducto', () => {
  // Clases: vacío · solo espacios · normal (con espacios a los lados) · exactamente 60 (límite) · 61
  it('vacío o ausente es inválido', () => {
    expect(validarNombreProducto('').ok).toBe(false)
    expect(validarNombreProducto(undefined).ok).toBe(false)
  })
  it('solo espacios es inválido', () => expect(validarNombreProducto('   ').error).toMatch(/Escribí/))
  it('normal: se recortan los espacios', () => expect(validarNombreProducto('  esp rosa ')).toEqual({ ok: true, nombre: 'esp rosa' }))
  it('exactamente 60 caracteres es válido (límite)', () => expect(validarNombreProducto('x'.repeat(60)).ok).toBe(true))
  it('61 caracteres es inválido', () => expect(validarNombreProducto('x'.repeat(61)).error).toMatch(/60/))
})

describe('validarMovimiento (sumar y restar sobre el total parcial)', () => {
  // Clases de cantidad: entero > 0 · decimal · cero · negativo · texto no numérico · vacío
  // Clases de resta: menor al total · igual al total (límite, queda 0) · mayor al total · total 0
  it('sumar un entero positivo', () => expect(validarMovimiento(0, '20', 'sumar')).toEqual({ ok: true, delta: 20 }))
  it('restar un entero menor al total da delta negativo', () => expect(validarMovimiento(20, '5', 'restar')).toEqual({ ok: true, delta: -5 }))
  it('restar exactamente el total es válido (límite)', () => expect(validarMovimiento(15, '15', 'restar')).toEqual({ ok: true, delta: -15 }))
  it('restar más que el total es inválido', () => {
    const r = validarMovimiento(15, '20', 'restar')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('No podés restar más de lo contado (15)')
  })
  it('restar con total 0 es inválido', () => expect(validarMovimiento(0, '1', 'restar').ok).toBe(false))
  it('decimal es inválido (con punto o con coma)', () => {
    expect(validarMovimiento(10, '2.5', 'sumar').error).toMatch(/enteros/)
    expect(validarMovimiento(10, '2,5', 'restar').error).toMatch(/enteros/)
  })
  it('cero es inválido', () => expect(validarMovimiento(10, '0', 'sumar').ok).toBe(false))
  it('negativo escrito es inválido (para restar se usa el botón Restar)', () => expect(validarMovimiento(10, '-3', 'sumar').ok).toBe(false))
  it('texto no numérico o vacío es inválido', () => {
    expect(validarMovimiento(10, 'abc', 'sumar').error).toBe('Ingresá una cantidad')
    expect(validarMovimiento(10, '', 'sumar').ok).toBe(false)
  })
  it('el total que llega como texto desde la base se interpreta', () => {
    expect(validarMovimiento('15.000', '15', 'restar').ok).toBe(true)
    expect(validarMovimiento('15.000', '16', 'restar').ok).toBe(false)
  })
})

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

describe('puedeExportar', () => {
  // Clases: sin productos · productos pero ninguno contado · al menos uno contado (límite: exactamente uno) · todos contados
  it('conteo sin productos: no se puede', () => {
    const r = puedeExportar([])
    expect(r.ok).toBe(false)
    expect(r.motivo).toBeTruthy()
  })
  it('hay productos pero ninguno contado: no se puede', () => {
    const r = puedeExportar([row({ movimientos: 0 }), row({ producto_id: 'p2', movimientos: 0 })])
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/ningún producto/)
  })
  it('exactamente un producto contado: sí se puede (límite)', () => {
    expect(puedeExportar([row({ movimientos: 1 }), row({ producto_id: 'p2', movimientos: 0 })]).ok).toBe(true)
  })
  it('todos contados: sí se puede', () => {
    expect(puedeExportar([row({ movimientos: 2 }), row({ producto_id: 'p2', movimientos: 1 })]).ok).toBe(true)
  })
  it('movimientos que llegan como texto desde la base', () => {
    expect(puedeExportar([row({ movimientos: '0' })]).ok).toBe(false)
    expect(puedeExportar([row({ movimientos: '3' })]).ok).toBe(true)
  })
})

describe('opcionContinuar / textoContinuar', () => {
  // Clases: sin conteo previo · previo sin contados · previo con contados del mismo día ·
  // previo con contados de otro día (ayer / otro mes) · cierre ausente (usa la creación) · contados como texto
  const ahora = new Date(2026, 9, 18, 15, 0) // 18/10/2026 15:00 hora local
  const cerrado = (fecha) => ({ nombre: 'Conteo A', cerrado_at: fecha.toISOString() })

  it('sin conteo previo: no se ofrece', () => {
    expect(opcionContinuar(null, 0, ahora)).toEqual({ disponible: false, sugerida: false })
    expect(opcionContinuar(undefined, undefined, ahora)).toEqual({ disponible: false, sugerida: false })
  })
  it('previo sin ningún producto contado: no se ofrece', () => {
    expect(opcionContinuar(cerrado(new Date(2026, 9, 18, 9, 0)), 0, ahora).disponible).toBe(false)
  })
  it('previo con contados cerrado hoy: se ofrece y se sugiere', () => {
    expect(opcionContinuar(cerrado(new Date(2026, 9, 18, 9, 30)), 3, ahora)).toEqual({ disponible: true, sugerida: true })
  })
  it('exactamente un contado cuenta (límite)', () => {
    expect(opcionContinuar(cerrado(new Date(2026, 9, 18, 9, 30)), 1, ahora).disponible).toBe(true)
  })
  it('previo cerrado ayer (23:59): se ofrece pero no se sugiere', () => {
    expect(opcionContinuar(cerrado(new Date(2026, 9, 17, 23, 59)), 3, ahora)).toEqual({ disponible: true, sugerida: false })
  })
  it('mismo número de día pero otro mes: no se sugiere', () => {
    expect(opcionContinuar(cerrado(new Date(2026, 8, 18, 10, 0)), 3, ahora).sugerida).toBe(false)
  })
  it('sin fecha de cierre usa la de creación', () => {
    const c = { nombre: 'X', created_at: new Date(2026, 9, 18, 8, 0).toISOString() }
    expect(opcionContinuar(c, 2, ahora).sugerida).toBe(true)
  })
  it('la cantidad de contados que llega como texto se interpreta', () => {
    expect(opcionContinuar(cerrado(new Date(2026, 9, 18, 9, 0)), '4', ahora).disponible).toBe(true)
  })

  it('textoContinuar: plural y singular', () => {
    expect(textoContinuar({ nombre: 'Conteo A' }, 3)).toBe('Continuar con «Conteo A» (3 productos contados)')
    expect(textoContinuar({ nombre: 'Conteo A' }, 1)).toBe('Continuar con «Conteo A» (1 producto contado)')
  })
})

describe('textos de cierre del conteo', () => {
  // Clases: ninguno contado · algunos contados (1 faltante / varios faltantes) · todos contados
  const contado = (id) => row({ producto_id: id, movimientos: 1 })
  const sin = (id) => row({ producto_id: id, movimientos: 0 })

  it('antes de cerrar, sin ningún contado: avisa que se cierra vacío', () => {
    const t = textoConfirmarCierre([sin('a'), sin('b')])
    expect(t).toMatch(/Ningún producto fue contado/)
    expect(t).toMatch(/vacío/)
  })
  it('antes de cerrar, conteo sin productos: también avisa que se cierra vacío', () => {
    expect(textoConfirmarCierre([])).toMatch(/vacío/)
  })
  it('antes de cerrar, con varios sin contar: cuenta los que faltan', () => {
    const t = textoConfirmarCierre([contado('a'), sin('b'), sin('c')])
    expect(t).toMatch(/Quedan 2 productos sin contar/)
    expect(t).not.toMatch(/vacío/)
  })
  it('antes de cerrar, con uno sin contar: singular', () => {
    expect(textoConfirmarCierre([contado('a'), sin('b')])).toMatch(/Queda 1 producto sin contar/)
  })
  it('antes de cerrar, todos contados: no menciona faltantes', () => {
    const t = textoConfirmarCierre([contado('a'), contado('b')])
    expect(t).not.toMatch(/sin contar/)
    expect(t).toMatch(/stock base/)
  })

  it('después de cerrar sin ningún contado: avisa que no hay resultado', () => {
    const t = textoCierreHecho([sin('a')])
    expect(t).toMatch(/sin ningún producto contado/)
    expect(t).not.toMatch(/Ya podés exportar/)
  })
  it('después de cerrar con un contado: singular y permite exportar', () => {
    expect(textoCierreHecho([contado('a'), sin('b')])).toBe('Conteo cerrado con 1 producto contado. Ya podés exportar el resultado.')
  })
  it('después de cerrar con varios contados: plural', () => {
    expect(textoCierreHecho([contado('a'), contado('b')])).toMatch(/2 productos contados/)
  })
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

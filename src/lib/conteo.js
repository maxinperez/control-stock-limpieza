// Lógica pura del conteo (sin React ni Supabase), para poder probarla.
import { parseNumero, validarCantidad } from './unidades'

const num = (v) => (v == null ? 0 : Number(v))

export const MAX_NOMBRE_PRODUCTO = 60

// Nombre libre del producto a contar (ej. "esp rosa").
export function validarNombreProducto(texto) {
  const nombre = String(texto ?? '').trim()
  if (!nombre) return { ok: false, error: 'Escribí qué vas a contar' }
  if (nombre.length > MAX_NOMBRE_PRODUCTO) {
    return { ok: false, error: `El nombre puede tener hasta ${MAX_NOMBRE_PRODUCTO} caracteres` }
  }
  return { ok: true, nombre }
}

export const MAX_PRODUCTOS_POR_CONTEO = 10

// Clave para detectar nombres repetidos: sin distinguir mayúsculas ni espacios de más.
const claveNombre = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

// Lista de nombres para abrir un conteo (de 1 a MAX_PRODUCTOS_POR_CONTEO).
// Devuelve { ok, nombres, errores } con un mensaje por posición (o null), y `error` si el problema es la lista.
export function validarNombresProductos(textos) {
  const lista = Array.isArray(textos) ? textos : []
  if (lista.length < 1) return { ok: false, error: 'Escribí qué vas a contar', errores: [] }
  if (lista.length > MAX_PRODUCTOS_POR_CONTEO) {
    return { ok: false, error: `Se pueden contar hasta ${MAX_PRODUCTOS_POR_CONTEO} productos por conteo`, errores: [] }
  }
  const vistos = new Set()
  const nombres = []
  const errores = lista.map((t) => {
    const v = validarNombreProducto(t)
    if (!v.ok) return v.error
    const clave = claveNombre(v.nombre)
    if (vistos.has(clave)) return 'Este nombre está repetido'
    vistos.add(clave)
    nombres.push(v.nombre)
    return null
  })
  const ok = errores.every((e) => e === null)
  return ok ? { ok, nombres, errores } : { ok, errores }
}

// Productos con algo contado en el conteo simple. Como no se puede cargar 0, un total de 0
// solo sale de sumar y restar lo mismo: equivale a no haber contado.
export const conCantidad = (rows) => rows.filter((r) => num(r.contado) > 0)

// Sumar o restar sobre el total parcial. Solo enteros positivos; el total nunca queda negativo.
// Devuelve { ok, delta, error }: delta es lo que se carga (negativo al restar).
export function validarMovimiento(total, texto, tipo) {
  const valor = parseNumero(texto)
  if (valor === null) return { ok: false, error: 'Ingresá una cantidad' }
  const r = validarCantidad('un', valor)
  if (!r.ok) return { ok: false, error: r.error }
  if (tipo === 'restar' && valor > num(total)) {
    return { ok: false, error: `No podés restar más de lo contado (${num(total)})` }
  }
  return { ok: true, delta: tipo === 'restar' ? -valor : valor }
}
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Suma a lo que ya está en el servidor las cargas que aún no se enviaron.
export function mergePendientes(rows, pendientes, conteoId) {
  const add = {}
  const cnt = {}
  for (const m of pendientes) {
    if (m.conteo_id !== conteoId) continue
    add[m.producto_id] = (add[m.producto_id] ?? 0) + m.cantidad
    cnt[m.producto_id] = (cnt[m.producto_id] ?? 0) + 1
  }
  return rows.map((r) => ({
    ...r,
    contado: num(r.contado) + (add[r.producto_id] ?? 0),
    movimientos: num(r.movimientos) + (cnt[r.producto_id] ?? 0),
  }))
}

export function progreso(view) {
  const total = view.length
  const hechos = view.filter((r) => r.movimientos > 0).length
  return { total, hechos, pct: total ? (hechos / total) * 100 : 0 }
}

// filtro: 'todos' | 'pendientes' | 'contados' · unidad: 'todas' | 'un' | 'kg' | 'lt'
export function filtrar(view, { q = '', filtro = 'todos', unidad = 'todas', limit = 150 } = {}) {
  const t = norm(q)
  return view.filter((r) => {
    if (filtro === 'pendientes' && r.movimientos > 0) return false
    if (filtro === 'contados' && r.movimientos === 0) return false
    if (unidad !== 'todas' && r.unidad !== unidad) return false
    if (!t) return true
    return norm(r.nombre).includes(t) || norm(r.codigo).includes(t) || norm(r.barcode).includes(t)
  }).slice(0, limit)
}

// ¿Se ofrece continuar el último conteo cerrado al iniciar uno nuevo?
// disponible: el último cerrado tuvo al menos un producto contado.
// sugerida: se cerró el mismo día calendario (hora local), así que lo normal es seguir sumando.
export function opcionContinuar(ultimoCerrado, contados, ahora = new Date()) {
  if (!ultimoCerrado || !(num(contados) > 0)) return { disponible: false, sugerida: false }
  const cierre = new Date(ultimoCerrado.cerrado_at ?? ultimoCerrado.created_at)
  const mismoDia = cierre.getFullYear() === ahora.getFullYear()
    && cierre.getMonth() === ahora.getMonth()
    && cierre.getDate() === ahora.getDate()
  return { disponible: true, sugerida: mismoDia }
}

export const textoContinuar = (ultimoCerrado, contados) =>
  `Continuar con «${ultimoCerrado.nombre}» (${plural(num(contados), 'producto contado', 'productos contados')})`

// El Excel de resultado solo tiene sentido si se contó al menos un producto.
export function puedeExportar(rows) {
  if (!rows.length) return { ok: false, motivo: 'Este conteo no tiene productos.' }
  if (!rows.some((r) => num(r.movimientos) > 0)) {
    return { ok: false, motivo: 'Todavía no se contó ningún producto: no hay nada para exportar.' }
  }
  return { ok: true, motivo: '' }
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// Aviso antes de cerrar el conteo, según lo que se contó.
export function textoConfirmarCierre(rows) {
  const hechos = rows.filter((r) => num(r.movimientos) > 0).length
  const faltan = rows.length - hechos
  const final = 'Ya no se podrán cargar más cantidades.'
  if (hechos === 0) {
    return `Ningún producto fue contado: el conteo se va a cerrar vacío y el stock base de la app no cambia. ${final}`
  }
  const sin = faltan > 0
    ? `${faltan === 1 ? 'Queda' : 'Quedan'} ${plural(faltan, 'producto', 'productos')} sin contar (conservan su stock actual). `
    : ''
  return `${sin}Lo contado pasa a ser el stock base de la app. ${final}`
}

// Aviso después de cerrar el conteo.
export function textoCierreHecho(rows) {
  const hechos = rows.filter((r) => num(r.movimientos) > 0).length
  if (hechos === 0) return 'Conteo cerrado sin ningún producto contado: no hay resultado para exportar.'
  return `Conteo cerrado con ${plural(hechos, 'producto contado', 'productos contados')}. Ya podés exportar el resultado.`
}

export const contados = (rows) => rows.filter((r) => num(r.movimientos) > 0)
export const sinContar = (rows) => rows.filter((r) => num(r.movimientos) === 0)

// Productos contados con diferencia, las más grandes (en valor absoluto) primero.
export function diferencias(rows) {
  return contados(rows)
    .filter((r) => num(r.diferencia) !== 0)
    .sort((a, b) => Math.abs(num(b.diferencia)) - Math.abs(num(a.diferencia)))
}

// Productos en o por debajo del mínimo. Usa lo contado; si no se contó, el stock del sistema.
export function reposicion(rows) {
  return rows
    .map((r) => ({ ...r, base: num(r.movimientos) > 0 ? num(r.contado) : num(r.stock_sistema) }))
    .filter((r) => num(r.stock_minimo) > 0 && r.base <= num(r.stock_minimo))
}

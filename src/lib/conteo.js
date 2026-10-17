// Lógica pura del conteo (sin React ni Supabase), para poder probarla.
const num = (v) => (v == null ? 0 : Number(v))
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

export const contados = (rows) => rows.filter((r) => num(r.movimientos) > 0)
export const sinContar = (rows) => rows.filter((r) => num(r.movimientos) === 0)

// Productos contados con diferencia, los de mayor impacto ($) primero.
export function diferencias(rows) {
  return contados(rows)
    .filter((r) => num(r.diferencia) !== 0)
    .sort((a, b) => Math.abs(num(b.diferencia) * (b.costo ?? 1)) - Math.abs(num(a.diferencia) * (a.costo ?? 1)))
}

// Productos en o por debajo del mínimo. Usa lo contado; si no se contó, el stock del sistema.
export function reposicion(rows) {
  return rows
    .map((r) => {
      const base = num(r.movimientos) > 0 ? num(r.contado) : num(r.stock_sistema)
      const ideal = r.stock_ideal != null ? num(r.stock_ideal) : num(r.stock_minimo) * 2
      return { ...r, base, sugerido: Math.max(ideal - base, 0) }
    })
    .filter((r) => num(r.stock_minimo) > 0 && r.base <= num(r.stock_minimo))
}

export const valorNeto = (difs) => difs.reduce((s, r) => s + num(r.diferencia) * (r.costo ?? 0), 0)

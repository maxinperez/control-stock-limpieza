// Unidades de medida permitidas. Deben coincidir con el check de public.productos.unidad.
export const UNIDADES = ['un', 'kg', 'lt']
export const ETIQUETA = { un: 'Unidad', kg: 'Kilo', lt: 'Litro' }

const limpiar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

const ALIAS = {
  un: ['un', 'u', 'uni', 'unid', 'unidad', 'unidades'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'],
  lt: ['lt', 'lts', 'l', 'litro', 'litros'],
}

// Texto libre de una planilla → 'un' | 'kg' | 'lt'. Vacío = 'un'. Desconocido = null.
export function normalizarUnidad(raw) {
  const k = limpiar(raw)
  if (k === '') return 'un'
  for (const [unidad, nombres] of Object.entries(ALIAS)) {
    if (nombres.includes(k)) return unidad
  }
  return null
}

// '12,5' → 12.5 · '' / null / texto → null
export function parseNumero(v) {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validar(unidad, valor, { permitirCero }) {
  if (!UNIDADES.includes(unidad)) return { ok: false, error: 'Unidad inválida' }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { ok: false, error: 'Ingresá un número' }
  if (valor < 0 || (valor === 0 && !permitirCero)) {
    return { ok: false, error: permitirCero ? 'No puede ser negativo' : 'Tiene que ser mayor a 0' }
  }
  if (unidad === 'un' && !Number.isInteger(valor)) return { ok: false, error: 'Las unidades se cuentan en números enteros' }
  if (unidad !== 'un' && Math.abs(Math.round(valor * 1000) - valor * 1000) > 1e-6) {
    return { ok: false, error: 'Máximo 3 decimales' }
  }
  return { ok: true }
}

// Cantidad a SUMAR: mayor a 0.
export const validarCantidad = (unidad, valor) => validar(unidad, valor, { permitirCero: false })
// Total corregido: puede ser 0.
export const validarTotal = (unidad, valor) => validar(unidad, valor, { permitirCero: true })

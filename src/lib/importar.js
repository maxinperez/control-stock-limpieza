import { normalizarUnidad, parseNumero } from './unidades'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Nombres de columna aceptados (sin tildes ni espacios) → campo interno
const ALIAS = {
  codigo: ['codigo', 'cod', 'sku', 'codigointerno', 'id', 'codigoarticulo'],
  barcode: ['barcode', 'codigobarras', 'codbarras', 'ean'],
  nombre: ['nombre', 'descripcion', 'producto', 'detalle', 'articulo'],
  unidad: ['unidad', 'um', 'medida'],
  categoria: ['categoria', 'rubro', 'familia'],
  costo: ['costo', 'preciocosto', 'costounitario'],
  stock: ['stock', 'existencia', 'cantidad', 'stockactual'],
  stock_minimo: ['stockminimo', 'minimo', 'min'],
  stock_ideal: ['stockideal', 'ideal', 'maximo'],
}

// rows: filas de la planilla (objetos). Devuelve los productos listos para importar.
export function parseSheet(rows) {
  const vacio = { items: [], skipped: 0, unidadesInvalidas: 0 }
  if (!rows.length) return { ...vacio, missing: ['codigo', 'nombre'] }

  const map = {}
  for (const key of Object.keys(rows[0])) {
    const n = norm(key)
    for (const [campo, names] of Object.entries(ALIAS)) {
      if (!(campo in map) && names.includes(n)) map[campo] = key
    }
  }
  const missing = ['nombre'].filter((c) => !(c in map))
  if (!('codigo' in map) && !('barcode' in map)) missing.push('codigo')
  if (missing.length) return { ...vacio, missing }

  const items = []
  let skipped = 0
  let unidadesInvalidas = 0
  for (const r of rows) {
    const get = (c) => (c in map ? r[map[c]] : undefined)
    const nombre = String(get('nombre') ?? '').trim()
    const codigo = String(get('codigo') ?? '').trim() || String(get('barcode') ?? '').trim()
    if (!nombre || !codigo) { skipped++; continue }
    const unidad = normalizarUnidad(get('unidad'))
    if (unidad === null) { unidadesInvalidas++; continue }
    const it = {
      codigo, nombre, unidad,
      barcode: String(get('barcode') ?? '').trim() || null,
      categoria: String(get('categoria') ?? '').trim() || null,
      costo: parseNumero(get('costo')),
      stock: parseNumero(get('stock')) ?? 0,
    }
    // Solo se incluyen si la planilla trae la columna (así no pisan lo cargado en la app)
    if ('stock_minimo' in map) it.stock_minimo = parseNumero(get('stock_minimo')) ?? 0
    if ('stock_ideal' in map) it.stock_ideal = parseNumero(get('stock_ideal'))
    items.push(it)
  }
  return { items, skipped, unidadesInvalidas, missing: [] }
}

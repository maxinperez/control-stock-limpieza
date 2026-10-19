import { UNIDADES, parseNumero } from './unidades'
import { norm } from './conteo'

// Fila de la tabla productos → textos para el formulario de edición.
export function aFormulario(p) {
  return {
    codigo: p.codigo ?? '',
    nombre: p.nombre ?? '',
    unidad: p.unidad ?? 'un',
    categoria: p.categoria ?? '',
    stock: p.stock_actual == null ? '' : String(Number(p.stock_actual)),
    stock_minimo: p.stock_minimo == null ? '' : String(Number(p.stock_minimo)),
  }
}

// Lista de productos de la pestaña Productos.
// archivados: false = solo activos · true = solo archivados.
export function filtrarProductos(productos, { q = '', unidad = 'todas', archivados = false, limit = 100 } = {}) {
  const t = norm(q)
  return productos.filter((p) => {
    if (Boolean(p.activo === false) !== archivados) return false
    if (unidad !== 'todas' && p.unidad !== unidad) return false
    if (!t) return true
    return norm(p.nombre).includes(t) || norm(p.codigo).includes(t)
  }).slice(0, limit)
}

// Mensaje de confirmación antes de eliminar.
export const AVISO_ELIMINAR =
  'Si el producto nunca se contó se borra definitivamente. Si ya participó en algún conteo se archiva: ' +
  'deja de aparecer en los conteos nuevos, pero se conservan los conteos anteriores y se puede reactivar.'

// Valida el formulario de producto nuevo. f contiene textos tal como se escribieron.
// Devuelve { ok, errores: { campo: mensaje }, valores } con los números ya convertidos.
export function validarProducto(f) {
  const errores = {}
  const codigo = String(f.codigo ?? '').trim()
  const nombre = String(f.nombre ?? '').trim()
  if (!codigo) errores.codigo = 'El código es obligatorio'
  if (!nombre) errores.nombre = 'El nombre es obligatorio'
  if (!UNIDADES.includes(f.unidad)) errores.unidad = 'Elegí una unidad'

  // Vacío = 0. Si se escribe algo, tiene que ser un número no negativo.
  const campoNumero = (campo) => {
    const raw = f[campo]
    if (raw === '' || raw == null) return 0
    const n = parseNumero(raw)
    if (n === null) { errores[campo] = 'Ingresá un número'; return null }
    if (n < 0) { errores[campo] = 'No puede ser negativo'; return null }
    return n
  }
  const stock = campoNumero('stock')
  const stock_minimo = campoNumero('stock_minimo')

  if (f.unidad === 'un' && stock !== null && !Number.isInteger(stock) && !errores.stock) {
    errores.stock = 'Las unidades se cargan en enteros'
  }

  return {
    ok: Object.keys(errores).length === 0,
    errores,
    valores: {
      codigo, nombre, unidad: f.unidad,
      categoria: String(f.categoria ?? '').trim() || null,
      stock: stock ?? 0, stock_minimo: stock_minimo ?? 0,
    },
  }
}

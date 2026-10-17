import { UNIDADES, parseNumero } from './unidades'

// Valida el formulario de producto nuevo. f contiene textos tal como se escribieron.
// Devuelve { ok, errores: { campo: mensaje }, valores } con los números ya convertidos.
export function validarProducto(f) {
  const errores = {}
  const codigo = String(f.codigo ?? '').trim()
  const nombre = String(f.nombre ?? '').trim()
  if (!codigo) errores.codigo = 'El código es obligatorio'
  if (!nombre) errores.nombre = 'El nombre es obligatorio'
  if (!UNIDADES.includes(f.unidad)) errores.unidad = 'Elegí una unidad'

  const campoNumero = (campo, { obligatorio = false } = {}) => {
    const raw = f[campo]
    const vacio = raw === '' || raw == null
    if (vacio) return obligatorio ? 0 : null
    const n = parseNumero(raw)
    if (n === null) { errores[campo] = 'Ingresá un número'; return null }
    if (n < 0) { errores[campo] = 'No puede ser negativo'; return null }
    return n
  }
  const stock = campoNumero('stock', { obligatorio: true })
  const stock_minimo = campoNumero('stock_minimo', { obligatorio: true })
  const stock_ideal = campoNumero('stock_ideal')
  const costo = campoNumero('costo')

  if (f.unidad === 'un' && stock !== null && !Number.isInteger(stock) && !errores.stock) {
    errores.stock = 'Las unidades se cargan en enteros'
  }
  if (stock_ideal !== null && stock_minimo !== null && stock_ideal < stock_minimo && !errores.stock_ideal) {
    errores.stock_ideal = 'El ideal no puede ser menor al mínimo'
  }

  return {
    ok: Object.keys(errores).length === 0,
    errores,
    valores: {
      codigo, nombre, unidad: f.unidad,
      categoria: String(f.categoria ?? '').trim() || null,
      costo, stock: stock ?? 0, stock_minimo: stock_minimo ?? 0, stock_ideal,
    },
  }
}

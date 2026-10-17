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

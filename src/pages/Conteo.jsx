import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { enqueue, flush, getCache, getPending, getRechazadas, limpiarRechazadas, setCache } from '../offline'
import {
  MAX_NOMBRE_PRODUCTO, MAX_PRODUCTOS_POR_CONTEO, conCantidad, mergePendientes, validarMovimiento, validarNombresProductos,
} from '../lib/conteo'

const num = (v) => (v == null ? 0 : Number(v))
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '')

// Conteo simple: el admin abre un conteo escribiendo qué va a contar ("esp rosa"),
// todos suman o restan sobre el total parcial, y al cerrarlo queda visible para revisar
// hasta que se abre el siguiente. Al abrir se elige cuántos productos (1 a 10, por defecto 1).
export default function Conteo({ profile, onChange }) {
  const admin = profile.rol === 'admin'
  const [conteo, setConteo] = useState(undefined) // undefined = cargando, null = no hay abierto
  const [rows, setRows] = useState([])
  const [ultimo, setUltimo] = useState(null) // { conteo, rows } del último cerrado, para revisar
  const [tick, setTick] = useState(0)
  const timer = useRef()

  const load = useCallback(async () => {
    const { data: c, error } = await supabase.from('conteos').select('*').eq('estado', 'abierto').maybeSingle()
    if (error) { // sin conexión: se usa lo último guardado
      const cache = getCache()
      if (cache) { setConteo(cache.conteo); setRows(cache.rows) } else setConteo(null)
      return
    }
    if (!c) {
      const { data: u } = await supabase.from('conteos').select('*').eq('estado', 'cerrado')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      let filas = []
      if (u) {
        const { data } = await supabase.from('conteo_resumen').select('*').eq('conteo_id', u.id).order('nombre').range(0, 4999)
        filas = data ?? []
      }
      setUltimo(u ? { conteo: u, rows: filas } : null)
      setConteo(null); setRows([])
      return
    }
    const { data } = await supabase.from('conteo_resumen').select('*').eq('conteo_id', c.id).order('nombre').range(0, 4999)
    setConteo(c); setRows(data ?? [])
    setCache({ conteo: c, rows: data ?? [] })
  }, [])

  useEffect(() => { load() }, [load])

  // Actualización en vivo cuando otro usuario suma o resta
  useEffect(() => {
    const ch = supabase.channel('mov')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conteo_movimientos' }, () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(load, 600)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch); clearTimeout(timer.current) }
  }, [load])

  // Suma lo pendiente de enviar para que el usuario vea su carga al instante
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => mergePendientes(rows, getPending(), conteo?.id), [rows, tick, conteo])
  const pendientes = getPending().filter((m) => m.conteo_id === conteo?.id).length
  const rechazadas = getRechazadas()

  async function cargar(row, delta) {
    enqueue({
      id: crypto.randomUUID(), conteo_id: conteo.id, producto_id: row.producto_id,
      cantidad: delta, usuario_id: profile.id, nota: null,
    })
    setTick((t) => t + 1); onChange()
    const r = await flush()
    setTick((t) => t + 1); onChange()
    if (!r.error && r.left === 0) load()
  }

  if (conteo === undefined) return <p className="muted">Cargando…</p>

  const avisoRechazadas = rechazadas > 0 && (
    <div className="banner">
      {rechazadas === 1 ? '1 carga no se guardó' : `${rechazadas} cargas no se guardaron`} (el conteo ya estaba cerrado o el total quedaba negativo).{' '}
      <button style={{ padding: '2px 8px' }} onClick={() => { limpiarRechazadas(); setTick((t) => t + 1) }}>Entendido</button>
    </div>
  )

  if (conteo === null) {
    return (
      <>
        {avisoRechazadas}
        {ultimo && <UltimoConteo ultimo={ultimo} />}
        {admin
          ? <AbrirConteo hayAnterior={Boolean(ultimo)} onAbierto={load} />
          : <div className="card muted">No hay un conteo abierto. Esperá a que el administrador abra uno.</div>}
      </>
    )
  }

  return (
    <>
      {avisoRechazadas}
      {view.map((r) => <ProductoEnConteo key={r.producto_id} row={r} onCargar={(delta) => cargar(r, delta)} />)}
      {admin && <CerrarConteo conteo={conteo} view={view} pendientes={pendientes} onCerrado={load} />}
    </>
  )
}

function ProductoEnConteo({ row, onCargar }) {
  const [n, setN] = useState('')
  const [err, setErr] = useState('')

  function aplicar(tipo) {
    const r = validarMovimiento(row.contado, n, tipo)
    if (!r.ok) { setErr(r.error); return }
    setErr(''); setN('')
    onCargar(r.delta)
  }

  return (
    <div className="card stack">
      <span className="muted">Contando</span>
      <b style={{ fontSize: 24 }}>{row.nombre}</b>
      <div className="big">Total: <b style={{ fontSize: 40 }}>{num(row.contado)}</b></div>
      <input inputMode="numeric" className="big" placeholder="Cantidad" value={n}
        onChange={(e) => { setN(e.target.value); setErr('') }} />
      <div className="row">
        {[1, 5, 10].map((k) => (
          <button key={k} className="grow" onClick={() => setN(String((Number.parseInt(n, 10) || 0) + k))}>+{k}</button>
        ))}
      </div>
      {err && <div className="err">{err}</div>}
      <div className="row">
        <button className="grow" onClick={() => aplicar('restar')}>− Restar</button>
        <button className="grow primary" onClick={() => aplicar('sumar')}>+ Sumar</button>
      </div>
    </div>
  )
}

function AbrirConteo({ hayAnterior, onAbierto }) {
  const [nombres, setNombres] = useState([''])
  const [errores, setErrores] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function cambiarCantidad(n) {
    // Conserva lo ya escrito al subir o bajar la cantidad
    setNombres((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''))
    setErrores([]); setErr('')
  }
  function cambiarNombre(i, valor) {
    setNombres((prev) => prev.map((x, j) => (j === i ? valor : x)))
    setErrores((prev) => prev.map((x, j) => (j === i ? null : x))); setErr('')
  }

  async function abrir(e) {
    e.preventDefault()
    const v = validarNombresProductos(nombres)
    setErrores(v.errores ?? [])
    if (!v.ok) { setErr(v.error ?? ''); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('abrir_conteo', { p_productos: v.nombres })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNombres(['']); setErrores([])
    onAbierto()
  }

  const varios = nombres.length > 1
  return (
    <form className="card stack" onSubmit={abrir}>
      <b>Nuevo conteo</b>
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="muted">¿Cuántos productos vas a contar?</span>
        <select aria-label="Cantidad de productos" value={nombres.length} onChange={(e) => cambiarCantidad(Number(e.target.value))}>
          {Array.from({ length: MAX_PRODUCTOS_POR_CONTEO }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n === 1 ? '1 producto' : `${n} productos`}</option>
          ))}
        </select>
      </label>
      {nombres.map((nombre, i) => (
        <label key={i} style={{ display: 'grid', gap: 4 }}>
          <span className="muted">{varios ? `Producto ${i + 1}` : '¿Qué vas a contar?'}</span>
          <input placeholder={i === 0 ? 'Ej: esp rosa' : `Producto ${i + 1}`} value={nombre} maxLength={MAX_NOMBRE_PRODUCTO}
            onChange={(e) => cambiarNombre(i, e.target.value)} />
          {errores[i] && <div className="err">{errores[i]}</div>}
        </label>
      ))}
      {varios && <span className="muted">Contar de a un producto ayuda a evitar errores.</span>}
      {hayAnterior && <span className="muted">Al abrir un conteo nuevo, el anterior deja de mostrarse.</span>}
      {err && <div className="err">{err}</div>}
      <button className="primary" disabled={busy}>Abrir conteo</button>
    </form>
  )
}

function UltimoConteo({ ultimo }) {
  const contados = conCantidad(ultimo.rows)
  return (
    <div className="card stack">
      <span className="muted">Último conteo · cerrado {fecha(ultimo.conteo.cerrado_at)}</span>
      {contados.length === 0 && <span>No se realizó ningún conteo.</span>}
      {contados.map((r) => (
        <div key={r.producto_id} className="row">
          <b className="grow">{r.nombre}</b>
          <b style={{ fontSize: 28 }}>{num(r.contado)}</b>
        </div>
      ))}
    </div>
  )
}

function CerrarConteo({ conteo, view, pendientes, onCerrado }) {
  const [confirmando, setConfirmando] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function cerrar() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('cerrar_conteo', { p_conteo: conteo.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setConfirmando(false)
    onCerrado()
  }

  if (!confirmando) {
    return <button className="danger" style={{ width: '100%' }} onClick={() => setConfirmando(true)}>Cerrar conteo</button>
  }
  return (
    <div className="card stack">
      <b>¿Cerrar el conteo?</b>
      {conCantidad(view).length === 0
        ? <span className="err">No se contó nada (el total es 0): se va a cerrar como un conteo no realizado.</span>
        : conCantidad(view).map((r) => <span key={r.producto_id}>{r.nombre}: <b>{num(r.contado)}</b></span>)}
      {pendientes > 0 && <span className="err">Hay {pendientes} carga(s) de este teléfono sin enviar todavía.</span>}
      <span className="muted">Ya no se podrán sumar ni restar cantidades. El resultado queda visible hasta que abras otro conteo.</span>
      {err && <div className="err">{err}</div>}
      <button className="danger" disabled={busy} onClick={cerrar}>Sí, cerrar conteo</button>
      <button disabled={busy} onClick={() => setConfirmando(false)}>No, volver</button>
    </div>
  )
}

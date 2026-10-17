import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { enqueue, flush, getCache, getPending, setCache } from '../offline'
import Scanner from './Scanner'

const num = (v) => (v == null ? 0 : Number(v))
const fmt = (v) => (Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(2))
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Conteo({ profile, onChange }) {
  const admin = profile.rol === 'admin'
  const [conteo, setConteo] = useState(undefined) // undefined = cargando, null = no hay abierto
  const [rows, setRows] = useState([])
  const [tick, setTick] = useState(0)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [sel, setSel] = useState(null)
  const [scan, setScan] = useState(false)
  const [alta, setAlta] = useState(null) // { barcode }
  const [nombreConteo, setNombreConteo] = useState('')
  const [err, setErr] = useState('')
  const timer = useRef()

  const load = useCallback(async () => {
    const { data: c, error } = await supabase.from('conteos').select('*').eq('estado', 'abierto').maybeSingle()
    if (error) { // sin conexión: se usa lo último guardado
      const cache = getCache()
      if (cache) { setConteo(cache.conteo); setRows(cache.rows) } else setConteo(null)
      return
    }
    if (!c) { setConteo(null); setRows([]); return }
    const { data } = await supabase.from('conteo_resumen').select('*').eq('conteo_id', c.id).order('nombre').range(0, 4999)
    setConteo(c); setRows(data ?? [])
    setCache({ conteo: c, rows: data ?? [] })
  }, [])

  useEffect(() => { load() }, [load])

  // Actualización en vivo cuando otro usuario carga algo
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
  const view = useMemo(() => {
    const add = {}, cnt = {}
    for (const m of getPending()) {
      if (m.conteo_id !== conteo?.id) continue
      add[m.producto_id] = (add[m.producto_id] ?? 0) + m.cantidad
      cnt[m.producto_id] = (cnt[m.producto_id] ?? 0) + 1
    }
    return rows.map((r) => ({
      ...r,
      contado: num(r.contado) + (add[r.producto_id] ?? 0),
      movimientos: num(r.movimientos) + (cnt[r.producto_id] ?? 0),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tick, conteo])

  const total = view.length
  const hechos = view.filter((r) => r.movimientos > 0).length

  const lista = useMemo(() => {
    const t = norm(q)
    return view.filter((r) => {
      if (filtro === 'pendientes' && r.movimientos > 0) return false
      if (filtro === 'contados' && r.movimientos === 0) return false
      if (!t) return true
      return norm(r.nombre).includes(t) || norm(r.codigo).includes(t) || norm(r.barcode).includes(t)
    }).slice(0, 150)
  }, [view, q, filtro])

  async function cargar(row, delta, nota) {
    if (!delta) return
    enqueue({
      id: crypto.randomUUID(), conteo_id: conteo.id, producto_id: row.producto_id,
      cantidad: delta, usuario_id: profile.id, nota: nota ?? null,
    })
    setTick((t) => t + 1); onChange()
    const r = await flush()
    onChange()
    if (!r.error && r.left === 0) load()
  }

  function onScan(code) {
    setScan(false)
    const c = norm(code)
    const hit = view.find((r) => norm(r.barcode) === c || norm(r.codigo) === c)
    if (hit) setSel(hit); else setAlta({ barcode: code })
  }

  async function iniciar() {
    setErr('')
    const { error } = await supabase.rpc('iniciar_conteo', { p_nombre: nombreConteo.trim() || 'Conteo ' + new Date().toLocaleDateString('es-AR') })
    if (error) setErr(error.message); else load()
  }

  if (conteo === undefined) return <p className="muted">Cargando…</p>

  if (conteo === null) {
    return (
      <div className="card stack">
        <b>No hay un conteo abierto.</b>
        {admin ? (
          <>
            <p className="muted" style={{ margin: 0 }}>Se toma una foto del stock actual de los productos importados. Asegurate de haber importado la planilla más reciente.</p>
            <input placeholder="Nombre (ej: Conteo octubre)" value={nombreConteo} onChange={(e) => setNombreConteo(e.target.value)} />
            <button className="primary" onClick={iniciar}>Iniciar conteo</button>
            {err && <div className="err">{err}</div>}
          </>
        ) : <span className="muted">Esperá a que el administrador inicie uno.</span>}
      </div>
    )
  }

  return (
    <>
      <div className="card stack">
        <div className="row">
          <b className="grow">{conteo.nombre}</b>
          <span className="muted">{hechos} / {total}</span>
        </div>
        <div className="bar"><i style={{ width: total ? `${(hechos / total) * 100}%` : 0 }} /></div>
        <div className="row">
          <input className="grow" placeholder="Buscar nombre o código…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={() => setScan(true)} aria-label="Escanear">Escanear</button>
        </div>
        <div className="chips">
          {['todos', 'pendientes', 'contados'].map((f) => (
            <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f}</button>
          ))}
          <button onClick={() => setAlta({ barcode: '' })}>+ Producto nuevo</button>
        </div>
      </div>

      <div className="card">
        {lista.length === 0 && <span className="muted">Sin resultados.</span>}
        {lista.map((r) => (
          <div key={r.producto_id} className="item" onClick={() => setSel(r)}>
            <div>
              <b>{r.nombre}</b>
              <span className="muted">{r.codigo} · {r.unidad}</span>
            </div>
            <div className="qty">
              {r.movimientos > 0
                ? <><b style={{ fontSize: 20 }}>{fmt(r.contado)}</b><br /><span className="pill ok">contado</span></>
                : <span className="pill">sin contar</span>}
            </div>
          </div>
        ))}
        {view.length > lista.length && <p className="muted">Mostrando {lista.length}. Usá el buscador para acotar.</p>}
      </div>

      {sel && (
        <Cargar
          row={view.find((r) => r.producto_id === sel.producto_id) ?? sel}
          admin={admin}
          onClose={() => setSel(null)}
          onSumar={(n) => cargar(sel, n)}
          onCorregir={(nuevo) => {
            const actual = view.find((r) => r.producto_id === sel.producto_id)?.contado ?? 0
            cargar(sel, nuevo - actual, 'corrección')
          }}
        />
      )}
      {scan && <Scanner onDetect={onScan} onClose={() => setScan(false)} />}
      {alta && (
        <AltaRapida
          conteoId={conteo.id} barcode={alta.barcode}
          onClose={() => setAlta(null)}
          onDone={async (id) => { setAlta(null); await load(); setSel({ producto_id: id }) }}
        />
      )}
    </>
  )
}

function Cargar({ row, admin, onClose, onSumar, onCorregir }) {
  const [n, setN] = useState('')
  const [total, setTotal] = useState('')
  const valor = Number(String(n).replace(',', '.'))

  return (
    <div className="modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="stack">
        <div>
          <b>{row.nombre}</b><br />
          <span className="muted">{row.codigo} · {row.unidad}{admin ? ` · sistema: ${fmt(row.stock_sistema)}` : ''}</span>
        </div>
        <div className="big">Contado: <b>{fmt(row.contado)}</b></div>
        <input inputMode="decimal" className="big" placeholder="Cantidad a sumar" value={n} autoFocus
          onChange={(e) => setN(e.target.value)} />
        <div className="row">
          {[1, 5, 10].map((k) => <button key={k} className="grow" onClick={() => setN(String((Number(n) || 0) + k))}>+{k}</button>)}
        </div>
        <button className="primary" disabled={!valor} onClick={() => { onSumar(valor); setN('') }}>Sumar al total</button>
        <details>
          <summary className="muted">Corregir el total</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <input inputMode="decimal" className="grow" placeholder="Total correcto" value={total} onChange={(e) => setTotal(e.target.value)} />
            <button disabled={total === ''} onClick={() => { onCorregir(Number(String(total).replace(',', '.'))); setTotal('') }}>Fijar</button>
          </div>
        </details>
        <button onClick={onClose}>Listo</button>
      </div>
    </div>
  )
}

function AltaRapida({ conteoId, barcode, onClose, onDone }) {
  const [f, setF] = useState({ nombre: '', unidad: 'un', codigo: '', barcode })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function guardar() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('alta_rapida', {
      p_conteo: conteoId, p_nombre: f.nombre, p_unidad: f.unidad, p_codigo: f.codigo, p_barcode: f.barcode,
    })
    setBusy(false)
    if (error) setErr(navigator.onLine ? error.message : 'Necesitás conexión para dar de alta un producto')
    else onDone(data)
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="stack" onClick={(e) => e.stopPropagation()}>
        <b>Producto nuevo</b>
        <span className="muted">Para productos que están en el local pero no en la planilla. Quedan marcados para cargarlos en el sistema principal.</span>
        <input placeholder="Nombre" value={f.nombre} onChange={set('nombre')} autoFocus />
        <select value={f.unidad} onChange={set('unidad')}>
          {['un', 'lt', 'kg', 'pack', 'caja'].map((u) => <option key={u}>{u}</option>)}
        </select>
        <input placeholder="Código interno (opcional)" value={f.codigo} onChange={set('codigo')} />
        <input placeholder="Código de barras (opcional)" value={f.barcode} onChange={set('barcode')} />
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={!f.nombre.trim() || busy} onClick={guardar}>Crear y contar</button>
        <button onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

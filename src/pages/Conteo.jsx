import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { enqueue, flush, getCache, getPending, setCache } from '../offline'
import { filtrar, mergePendientes, progreso } from '../lib/conteo'
import { ETIQUETA, UNIDADES, parseNumero, validarCantidad, validarTotal } from '../lib/unidades'

const num = (v) => (v == null ? 0 : Number(v))
const fmt = (v) => (Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(3).replace(/0+$/, ''))

export default function Conteo({ profile, onChange }) {
  const admin = profile.rol === 'admin'
  const [conteo, setConteo] = useState(undefined) // undefined = cargando, null = no hay abierto
  const [rows, setRows] = useState([])
  const [tick, setTick] = useState(0)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [unidad, setUnidad] = useState('todas')
  const [sel, setSel] = useState(null)
  const [alta, setAlta] = useState(false)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => mergePendientes(rows, getPending(), conteo?.id), [rows, tick, conteo])
  const { total, hechos, pct } = progreso(view)
  const lista = useMemo(() => filtrar(view, { q, filtro, unidad }), [view, q, filtro, unidad])

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
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <input placeholder="Buscar nombre o código…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {['todos', 'pendientes', 'contados'].map((f) => (
            <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f}</button>
          ))}
        </div>
        <div className="chips">
          {['todas', ...UNIDADES].map((u) => (
            <button key={u} className={unidad === u ? 'on' : ''} onClick={() => setUnidad(u)}>
              {u === 'todas' ? 'todas las unidades' : ETIQUETA[u] + 's'}
            </button>
          ))}
          <button onClick={() => setAlta(true)}>+ Producto nuevo</button>
        </div>
      </div>

      <div className="card">
        {lista.length === 0 && <span className="muted">Sin resultados.</span>}
        {lista.map((r) => (
          <div key={r.producto_id} className="item" onClick={() => setSel(r)}>
            <div>
              <b>{r.nombre}</b>
              <span className="muted">{r.codigo} · {ETIQUETA[r.unidad] ?? r.unidad}</span>
            </div>
            <div className="qty">
              {r.movimientos > 0
                ? <><b style={{ fontSize: 20 }}>{fmt(r.contado)} {r.unidad}</b><br /><span className="pill ok">contado</span></>
                : <span className="pill">sin contar</span>}
            </div>
          </div>
        ))}
        {view.length > lista.length && <p className="muted">Mostrando {lista.length}. Usá el buscador o los filtros para acotar.</p>}
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
      {alta && (
        <AltaRapida
          conteoId={conteo.id}
          onClose={() => setAlta(false)}
          onDone={async (id) => { setAlta(false); await load(); setSel({ producto_id: id }) }}
        />
      )}
    </>
  )
}

function Cargar({ row, admin, onClose, onSumar, onCorregir }) {
  const [n, setN] = useState('')
  const [total, setTotal] = useState('')
  const entero = row.unidad === 'un'
  const atajos = entero ? [1, 5, 10] : [0.5, 1, 5]
  const valor = parseNumero(n)
  const check = valor === null ? { ok: false } : validarCantidad(row.unidad, valor)
  const valorTotal = parseNumero(total)
  const checkTotal = valorTotal === null ? { ok: false } : validarTotal(row.unidad, valorTotal)

  return (
    <div className="modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="stack">
        <div>
          <b>{row.nombre}</b><br />
          <span className="muted">{row.codigo} · {ETIQUETA[row.unidad] ?? row.unidad}{admin ? ` · sistema: ${fmt(row.stock_sistema)}` : ''}</span>
        </div>
        <div className="big">Contado: <b>{fmt(row.contado)} {row.unidad}</b></div>
        <input inputMode={entero ? 'numeric' : 'decimal'} className="big" placeholder={`Cantidad a sumar (${row.unidad})`} value={n} autoFocus
          onChange={(e) => setN(e.target.value)} />
        <div className="row">
          {atajos.map((k) => <button key={k} className="grow" onClick={() => setN(String((parseNumero(n) || 0) + k))}>+{k}</button>)}
        </div>
        {n !== '' && !check.ok && check.error && <div className="err">{check.error}</div>}
        <button className="primary" disabled={!check.ok} onClick={() => { onSumar(valor); setN('') }}>Sumar al total</button>
        <details>
          <summary className="muted">Corregir el total</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <input inputMode={entero ? 'numeric' : 'decimal'} className="grow" placeholder="Total correcto" value={total} onChange={(e) => setTotal(e.target.value)} />
            <button disabled={!checkTotal.ok} onClick={() => { onCorregir(valorTotal); setTotal('') }}>Fijar</button>
          </div>
          {total !== '' && !checkTotal.ok && checkTotal.error && <div className="err">{checkTotal.error}</div>}
        </details>
        <button onClick={onClose}>Listo</button>
      </div>
    </div>
  )
}

function AltaRapida({ conteoId, onClose, onDone }) {
  const [f, setF] = useState({ nombre: '', unidad: 'un', codigo: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function guardar() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('alta_rapida', {
      p_conteo: conteoId, p_nombre: f.nombre, p_unidad: f.unidad, p_codigo: f.codigo, p_barcode: '',
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
          {UNIDADES.map((u) => <option key={u} value={u}>{ETIQUETA[u]}</option>)}
        </select>
        <input placeholder="Código interno (opcional)" value={f.codigo} onChange={set('codigo')} />
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={!f.nombre.trim() || busy} onClick={guardar}>Crear y contar</button>
        <button onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

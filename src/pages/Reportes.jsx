import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import {
  contados as contadosDe, diferencias, puedeExportar, reposicion, sinContar as sinContarDe,
  textoCierreHecho, textoConfirmarCierre,
} from '../lib/conteo'

const num = (v) => (v == null ? 0 : Number(v))
const fmt = (v) => (Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(3).replace(/0+$/, ''))

export default function Reportes() {
  const [conteos, setConteos] = useState([])
  const [id, setId] = useState('')
  const [rows, setRows] = useState([])
  const [vista, setVista] = useState('dif')
  const [msg, setMsg] = useState('')
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)

  useEffect(() => {
    supabase.from('conteos').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setConteos(data ?? [])
      if (data?.length) setId(data[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('conteo_resumen').select('*').eq('conteo_id', id).order('nombre').range(0, 4999)
    setRows((data ?? []).map((r) => ({ ...r, contado: num(r.contado), stock_sistema: num(r.stock_sistema), diferencia: num(r.diferencia), movimientos: num(r.movimientos) })))
  }, [id])
  useEffect(() => { load() }, [load])

  const conteo = conteos.find((c) => c.id === id)
  const anterior = conteo?.continua_de ? conteos.find((c) => c.id === conteo.continua_de) : null
  const contados = useMemo(() => contadosDe(rows), [rows])
  const sinContar = useMemo(() => sinContarDe(rows), [rows])
  const difs = useMemo(() => diferencias(rows), [rows])
  const reponer = useMemo(() => reposicion(rows), [rows])

  const exportable = puedeExportar(rows)

  function exportar() {
    if (!exportable.ok) return
    const wb = XLSX.utils.book_new()
    const resultado = contados.map((r) => ({
      codigo: r.codigo, nombre: r.nombre, unidad: r.unidad, stock_sistema: r.stock_sistema,
      contado: r.contado, diferencia: r.diferencia,
    }))
    const ajustes = difs.map((r) => ({ codigo: r.codigo, nombre: r.nombre, unidad: r.unidad, stock_nuevo: r.contado, diferencia: r.diferencia }))
    const rep = reponer.map((r) => ({ codigo: r.codigo, nombre: r.nombre, unidad: r.unidad, stock: r.base, minimo: r.stock_minimo }))
    for (const [nombre, data] of [['Resultado', resultado], ['Ajustes a cargar', ajustes], ['Reposicion', rep]]) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), nombre)
    }
    XLSX.writeFile(wb, `conteo-${(conteo?.nombre ?? 'stock').replace(/[^\w-]+/g, '_')}.xlsx`)
  }

  async function cerrar() {
    setConfirmandoCierre(false)
    const { error } = await supabase.rpc('cerrar_conteo', { p_conteo: id })
    if (error) { setMsg(error.message); return }
    const { data } = await supabase.from('conteos').select('*').order('created_at', { ascending: false })
    setConteos(data ?? []); setMsg(textoCierreHecho(rows))
  }

  if (!conteos.length) return <div className="card muted">Todavía no hay conteos.</div>

  const lista = vista === 'dif' ? difs : vista === 'sin' ? sinContar : reponer

  return (
    <>
      <div className="card stack">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {conteos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.estado}</option>)}
        </select>
        {conteo?.continua_de && (
          <div className="muted">
            Continúa de «{anterior?.nombre ?? 'un conteo anterior'}». Acumula lo contado antes: cargá en el sistema principal solo este resultado.
          </div>
        )}
        <div className="row">
          <span className="grow">Contados <b>{contados.length}/{rows.length}</b></span>
          <span className="grow">Con diferencia <b>{difs.length}</b></span>
        </div>
        <div className="row">
          <button className="grow" onClick={load}>Actualizar</button>
          <button className="grow primary" onClick={exportar} disabled={!exportable.ok}>Exportar Excel</button>
        </div>
        {!exportable.ok && <div className="muted">{exportable.motivo}</div>}
        {conteo?.estado === 'abierto' && !confirmandoCierre && (
          <button className="danger" onClick={() => setConfirmandoCierre(true)}>Cerrar conteo</button>
        )}
        {conteo?.estado === 'abierto' && confirmandoCierre && (
          <div className="card stack" style={{ margin: 0 }}>
            <b>¿Cerrar el conteo?</b>
            <span className="muted">{textoConfirmarCierre(rows)}</span>
            <button className="danger" onClick={cerrar}>Sí, cerrar conteo</button>
            <button onClick={() => setConfirmandoCierre(false)}>No, volver</button>
          </div>
        )}
        {msg && <div className="muted">{msg}</div>}
      </div>

      <div className="card stack">
        <div className="chips">
          {[['dif', `Diferencias (${difs.length})`], ['sin', `Sin contar (${sinContar.length})`], ['rep', `A reponer (${reponer.length})`]].map(([k, l]) => (
            <button key={k} className={vista === k ? 'on' : ''} onClick={() => setVista(k)}>{l}</button>
          ))}
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                {vista === 'dif' && <><th className="n">Sist.</th><th className="n">Cont.</th><th className="n">Dif.</th></>}
                {vista === 'sin' && <th className="n">Sist.</th>}
                {vista === 'rep' && <><th className="n">Stock</th><th className="n">Mín.</th></>}
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.producto_id}>
                  <td>{r.nombre}<br /><span className="muted">{r.codigo}</span></td>
                  {vista === 'dif' && <>
                    <td className="n">{fmt(r.stock_sistema)}</td><td className="n">{fmt(r.contado)}</td>
                    <td className="n" style={{ color: r.diferencia < 0 ? 'var(--bad)' : 'var(--ok)' }}>{r.diferencia > 0 ? '+' : ''}{fmt(r.diferencia)}</td>
                  </>}
                  {vista === 'sin' && <td className="n">{fmt(r.stock_sistema)}</td>}
                  {vista === 'rep' && <><td className="n">{fmt(r.base)}</td><td className="n">{fmt(r.stock_minimo)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!lista.length && <span className="muted">Nada para mostrar.</span>}
        {vista === 'rep' && <span className="muted">Para usar esta lista, cargá el stock mínimo de cada producto en la pestaña Productos.</span>}
      </div>
    </>
  )
}

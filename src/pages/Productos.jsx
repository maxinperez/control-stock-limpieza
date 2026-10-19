import { useCallback, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { parseSheet } from '../lib/importar'
import { AVISO_ELIMINAR, aFormulario, filtrarProductos, validarProducto } from '../lib/producto'
import { ETIQUETA, UNIDADES, parseNumero } from '../lib/unidades'

const VACIO = { codigo: '', nombre: '', unidad: 'un', categoria: '', stock: '', stock_minimo: '' }

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [q, setQ] = useState('')
  const [unidad, setUnidad] = useState('todas')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [archivados, setArchivados] = useState(false)
  const [editando, setEditando] = useState(null)
  const [aviso, setAviso] = useState('')
  const [conteoAbierto, setConteoAbierto] = useState(false)

  const load = useCallback(async () => {
    const [{ data }, { data: abierto }] = await Promise.all([
      supabase.from('productos').select('*').order('nombre').range(0, 4999),
      supabase.from('conteos').select('id').eq('estado', 'abierto').maybeSingle(),
    ])
    setProductos(data ?? [])
    setConteoAbierto(Boolean(abierto))
  }, [])
  useEffect(() => { load() }, [load])

  async function importar(file) {
    if (!file) return
    setBusy(true); setMsg('')
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const { items, skipped, unidadesInvalidas, missing } = parseSheet(rows)
      if (missing.length) { setMsg(`Faltan columnas en la planilla: ${missing.join(', ')}.`); return }
      if (!items.length) { setMsg('No se encontraron productos válidos.'); return }
      for (let i = 0; i < items.length; i += 300) {
        const { error } = await supabase.rpc('importar_productos', { p_rows: items.slice(i, i + 300) })
        if (error) { setMsg(error.message); return }
      }
      const avisos = []
      if (skipped) avisos.push(`${skipped} sin código o nombre`)
      if (unidadesInvalidas) avisos.push(`${unidadesInvalidas} con unidad no válida (usá un, kg o lt)`)
      setMsg(`Importados ${items.length} productos${avisos.length ? `. Omitidos: ${avisos.join('; ')}` : ''}.`)
      load()
    } catch (e) {
      setMsg('No se pudo leer el archivo: ' + e.message)
    } finally { setBusy(false) }
  }

  function plantilla() {
    const ws = XLSX.utils.json_to_sheet([
      { codigo: 'A001', nombre: 'Esponja doble faz', unidad: 'un', categoria: 'Secos', stock: 120, stock_minimo: 20 },
      { codigo: 'L010', nombre: 'Detergente a granel', unidad: 'lt', categoria: 'Líquidos', stock: 35.5, stock_minimo: 10 },
      { codigo: 'P020', nombre: 'Jabón en pasta', unidad: 'kg', categoria: 'Pastas', stock: 12.25, stock_minimo: 5 },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-productos.xlsx')
  }

  async function guardarMinimo(p, valor) {
    const v = parseNumero(valor)
    if (v === null || v < 0 || v === Number(p.stock_minimo)) return
    const { error } = await supabase.from('productos').update({ stock_minimo: v }).eq('id', p.id)
    if (error) setMsg(error.message)
    else setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, stock_minimo: v } : x)))
  }

  const lista = filtrarProductos(productos, { q, unidad, archivados })
  const totalFiltrados = filtrarProductos(productos, { q, unidad, archivados, limit: Infinity }).length
  const activos = productos.filter((p) => p.activo !== false).length
  const nArchivados = productos.length - activos
  const nuevos = productos.filter((p) => p.origen === 'alta_rapida' && p.activo !== false).length

  return (
    <>
      <NuevoProducto onCreado={load} />

      <div className="card stack">
        <b>Importar productos y stock</b>
        <span className="muted">
          Subí la copia de la planilla del sistema (Excel o CSV). Columnas: codigo, nombre, stock; opcionales: unidad (un, kg o lt), categoria, stock_minimo.
          Si el código ya existe se actualiza; los que no están no se tocan. No se puede importar con un conteo abierto.
        </span>
        <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => { importar(e.target.files[0]); e.target.value = '' }} />
        <button onClick={plantilla}>Descargar plantilla de ejemplo</button>
        {msg && <div className={msg.startsWith('Importados') ? 'muted' : 'err'}>{msg}</div>}
      </div>

      <div className="card stack">
        <div className="row">
          <b className="grow">{activos} productos</b>
          {nuevos > 0 && <span className="pill warn">{nuevos} alta rápida</span>}
        </div>
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {['todas', ...UNIDADES].map((u) => (
            <button key={u} className={unidad === u ? 'on' : ''} onClick={() => setUnidad(u)}>
              {u === 'todas' ? 'todas' : ETIQUETA[u] + 's'}
            </button>
          ))}
          <button className={archivados ? 'on' : ''} onClick={() => setArchivados(!archivados)}>
            archivados ({nArchivados})
          </button>
        </div>
        <div className="scroll">
          <table>
            <thead><tr><th>Producto</th><th className="n">Stock</th><th className="n">Mín.</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}<br /><span className="muted">{p.codigo} · {p.unidad}{p.origen === 'alta_rapida' ? ' · nuevo' : ''}</span></td>
                  <td className="n">{Number(p.stock_actual)}</td>
                  <td className="n"><Mini value={p.stock_minimo} onSave={(v) => guardarMinimo(p, v)} /></td>
                  <td><button style={{ padding: '6px 10px' }} onClick={() => setEditando(p)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {aviso && <div className="muted">{aviso}</div>}
        {!lista.length && <span className="muted">{archivados ? 'No hay productos archivados.' : 'Sin resultados.'}</span>}
        {totalFiltrados > lista.length && <span className="muted">Mostrando {lista.length}. Usá el buscador.</span>}
      </div>

      {editando && (
        <EditarProducto
          producto={editando}
          conteoAbierto={conteoAbierto}
          onClose={() => setEditando(null)}
          onCambio={(texto) => { setEditando(null); setAviso(texto); load() }}
        />
      )}
    </>
  )
}

function NuevoProducto({ onCreado }) {
  const [f, setF] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const campo = (k, placeholder, props = {}) => (
    <div>
      <input placeholder={placeholder} value={f[k]} onChange={set(k)} {...props} />
      {errores[k] && <div className="err">{errores[k]}</div>}
    </div>
  )

  async function guardar(e) {
    e.preventDefault()
    setMsg('')
    const r = validarProducto(f)
    setErrores(r.errores)
    if (!r.ok) return
    const v = r.valores
    setBusy(true)
    const { error } = await supabase.rpc('crear_producto', {
      p_codigo: v.codigo, p_nombre: v.nombre, p_unidad: v.unidad, p_categoria: v.categoria,
      p_stock: v.stock, p_minimo: v.stock_minimo,
    })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setF(VACIO)
    setMsg('Producto creado.')
    onCreado()
  }

  return (
    <details className="card">
      <summary><b>Cargar un producto a mano</b></summary>
      <form className="stack" style={{ marginTop: 10 }} onSubmit={guardar}>
        {campo('codigo', 'Código *')}
        {campo('nombre', 'Nombre *')}
        <select value={f.unidad} onChange={set('unidad')}>
          {UNIDADES.map((u) => <option key={u} value={u}>{ETIQUETA[u]}</option>)}
        </select>
        {campo('categoria', 'Categoría (opcional)')}
        {campo('stock', `Stock inicial (${f.unidad})`, { inputMode: f.unidad === 'un' ? 'numeric' : 'decimal' })}
        {campo('stock_minimo', 'Stock mínimo', { inputMode: 'decimal' })}
        <button className="primary" disabled={busy}>Crear producto</button>
        {msg && <div className={msg === 'Producto creado.' ? 'muted' : 'err'}>{msg}</div>}
      </form>
    </details>
  )
}

function EditarProducto({ producto, conteoAbierto, onClose, onCambio }) {
  const archivado = producto.activo === false
  const [f, setF] = useState(aFormulario(producto))
  const [errores, setErrores] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const campo = (k, etiqueta, props = {}) => (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="muted">{etiqueta}</span>
      <input value={f[k]} onChange={set(k)} {...props} />
      {errores[k] && <div className="err">{errores[k]}</div>}
    </label>
  )

  async function guardar(e) {
    e.preventDefault()
    setMsg('')
    const r = validarProducto(f)
    setErrores(r.errores)
    if (!r.ok) return
    const v = r.valores
    setBusy(true)
    const { error } = await supabase.rpc('editar_producto', {
      p_id: producto.id, p_codigo: v.codigo, p_nombre: v.nombre, p_unidad: v.unidad,
      p_categoria: v.categoria, p_stock: v.stock, p_minimo: v.stock_minimo,
    })
    setBusy(false)
    if (error) setMsg(error.message)
    else onCambio('Producto actualizado.')
  }

  async function eliminar() {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('eliminar_producto', { p_id: producto.id })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    onCambio(data === 'archivado'
      ? `"${producto.nombre}" tenía historial: quedó archivado (podés reactivarlo desde "archivados").`
      : `"${producto.nombre}" se eliminó.`)
  }

  async function reactivar() {
    setBusy(true); setMsg('')
    const { error } = await supabase.from('productos').update({ activo: true }).eq('id', producto.id)
    setBusy(false)
    if (error) setMsg(error.message)
    else onCambio('Producto reactivado.')
  }

  return (
    <div className="modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
      <form className="stack" onSubmit={guardar}>
        <b>Editar producto {archivado && <span className="pill warn">archivado</span>}</b>
        {campo('codigo', 'Código')}
        {campo('nombre', 'Nombre')}
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="muted">Unidad</span>
          <select value={f.unidad} onChange={set('unidad')}>
            {UNIDADES.map((u) => <option key={u} value={u}>{ETIQUETA[u]}</option>)}
          </select>
          {errores.unidad && <div className="err">{errores.unidad}</div>}
        </label>
        {campo('categoria', 'Categoría')}
        {campo('stock', `Stock del sistema (${f.unidad})`, {
          inputMode: f.unidad === 'un' ? 'numeric' : 'decimal', disabled: conteoAbierto,
        })}
        {conteoAbierto && <span className="muted">El stock del sistema no se puede cambiar mientras hay un conteo abierto: se fijó al iniciarlo.</span>}
        {campo('stock_minimo', 'Stock mínimo', { inputMode: 'decimal' })}
        {msg && <div className="err">{msg}</div>}
        <button className="primary" disabled={busy}>Guardar cambios</button>
        {archivado && <button type="button" disabled={busy} onClick={reactivar}>Reactivar producto</button>}
        {!archivado && !confirmando && (
          <button type="button" className="danger" disabled={busy} onClick={() => setConfirmando(true)}>Eliminar producto</button>
        )}
        {!archivado && confirmando && (
          <div className="card stack" style={{ margin: 0 }}>
            <b>¿Eliminar "{producto.nombre}"?</b>
            <span className="muted">{AVISO_ELIMINAR}</span>
            <button type="button" className="danger" disabled={busy} onClick={eliminar}>Sí, eliminar</button>
            <button type="button" disabled={busy} onClick={() => setConfirmando(false)}>No, volver</button>
          </div>
        )}
        <button type="button" onClick={onClose}>Cancelar</button>
      </form>
      </div>
    </div>
  )
}

function Mini({ value, onSave }) {
  return (
    <input
      style={{ width: 70, padding: 6, textAlign: 'right' }} inputMode="decimal"
      defaultValue={value ?? ''} key={value ?? 'x'}
      onBlur={(e) => onSave(e.target.value)}
    />
  )
}

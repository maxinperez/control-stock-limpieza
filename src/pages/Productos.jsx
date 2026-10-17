import { useCallback, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

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

const toNum = (v) => {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return v
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseSheet(rows) {
  if (!rows.length) return { items: [], skipped: 0, missing: ['codigo', 'nombre'] }
  const map = {}
  for (const key of Object.keys(rows[0])) {
    const n = norm(key)
    for (const [campo, names] of Object.entries(ALIAS)) {
      if (!(campo in map) && names.includes(n)) map[campo] = key
    }
  }
  const missing = ['nombre'].filter((c) => !(c in map))
  if (!('codigo' in map) && !('barcode' in map)) missing.push('codigo')
  if (missing.length) return { items: [], skipped: 0, missing }

  const items = []
  let skipped = 0
  for (const r of rows) {
    const get = (c) => (c in map ? r[map[c]] : undefined)
    const nombre = String(get('nombre') ?? '').trim()
    const codigo = String(get('codigo') ?? get('barcode') ?? '').trim()
    if (!nombre || !codigo) { skipped++; continue }
    const it = {
      codigo, nombre,
      barcode: String(get('barcode') ?? '').trim() || null,
      unidad: String(get('unidad') ?? '').trim() || 'un',
      categoria: String(get('categoria') ?? '').trim() || null,
      costo: toNum(get('costo')),
      stock: toNum(get('stock')) ?? 0,
    }
    // Solo se incluyen si la planilla trae la columna (así no pisan lo cargado en la app)
    if ('stock_minimo' in map) it.stock_minimo = toNum(get('stock_minimo')) ?? 0
    if ('stock_ideal' in map) it.stock_ideal = toNum(get('stock_ideal'))
    items.push(it)
  }
  return { items, skipped, missing: [] }
}

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('productos').select('*').order('nombre').range(0, 4999)
    setProductos(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function importar(file) {
    if (!file) return
    setBusy(true); setMsg('')
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const { items, skipped, missing } = parseSheet(rows)
      if (missing.length) { setMsg(`Faltan columnas en la planilla: ${missing.join(', ')}.`); return }
      if (!items.length) { setMsg('No se encontraron productos válidos.'); return }
      for (let i = 0; i < items.length; i += 300) {
        const { error } = await supabase.rpc('importar_productos', { p_rows: items.slice(i, i + 300) })
        if (error) { setMsg(error.message); return }
      }
      setMsg(`Importados ${items.length} productos${skipped ? ` (${skipped} filas omitidas por no tener código o nombre)` : ''}.`)
      load()
    } catch (e) {
      setMsg('No se pudo leer el archivo: ' + e.message)
    } finally { setBusy(false) }
  }

  function plantilla() {
    const ws = XLSX.utils.json_to_sheet([
      { codigo: 'A001', nombre: 'Esponja doble faz', unidad: 'un', categoria: 'Secos', barcode: '', costo: 450, stock: 120, stock_minimo: 20, stock_ideal: 60 },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-productos.xlsx')
  }

  async function guardarUmbral(p, campo, valor) {
    const v = valor === '' ? null : Number(String(valor).replace(',', '.'))
    if (campo === 'stock_minimo' && v == null) return
    if (v === p[campo] || Number.isNaN(v)) return
    const { error } = await supabase.from('productos').update({ [campo]: v }).eq('id', p.id)
    if (error) setMsg(error.message)
    else setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, [campo]: v } : x)))
  }

  const t = norm(q)
  const lista = productos.filter((p) => !t || norm(p.nombre).includes(t) || norm(p.codigo).includes(t)).slice(0, 100)
  const nuevos = productos.filter((p) => p.origen === 'alta_rapida').length

  return (
    <>
      <div className="card stack">
        <b>Importar productos y stock</b>
        <span className="muted">
          Subí la copia de la planilla del sistema (Excel o CSV). Columnas: codigo, nombre, stock; opcionales: unidad, categoria, barcode, costo, stock_minimo, stock_ideal.
          Si el código ya existe se actualiza; los que no están no se tocan. No se puede importar con un conteo abierto.
        </span>
        <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => { importar(e.target.files[0]); e.target.value = '' }} />
        <button onClick={plantilla}>Descargar plantilla de ejemplo</button>
        {msg && <div className={msg.startsWith('Importados') ? 'muted' : 'err'}>{msg}</div>}
      </div>

      <div className="card stack">
        <div className="row">
          <b className="grow">{productos.length} productos</b>
          {nuevos > 0 && <span className="pill warn">{nuevos} alta rápida</span>}
        </div>
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll">
          <table>
            <thead><tr><th>Producto</th><th className="n">Stock</th><th className="n">Mín.</th><th className="n">Ideal</th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}<br /><span className="muted">{p.codigo}{p.origen === 'alta_rapida' ? ' · nuevo' : ''}</span></td>
                  <td className="n">{Number(p.stock_actual)}</td>
                  <td className="n"><Mini value={p.stock_minimo} onSave={(v) => guardarUmbral(p, 'stock_minimo', v)} /></td>
                  <td className="n"><Mini value={p.stock_ideal} onSave={(v) => guardarUmbral(p, 'stock_ideal', v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {productos.length > lista.length && <span className="muted">Mostrando {lista.length}. Usá el buscador.</span>}
      </div>
    </>
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

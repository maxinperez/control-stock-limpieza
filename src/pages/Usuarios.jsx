import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Usuarios({ me }) {
  const [users, setUsers] = useState([])
  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: 'contador' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function crear(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('create-user', { body: f })
    setBusy(false)
    if (error || data?.error) { setMsg(data?.error ?? error.message); return }
    setF({ nombre: '', email: '', password: '', rol: 'contador' })
    setMsg('Usuario creado.')
    load()
  }

  async function toggle(u) {
    await supabase.from('profiles').update({ activo: !u.activo }).eq('id', u.id)
    load()
  }

  return (
    <>
      <form className="card stack" onSubmit={crear}>
        <b>Nuevo usuario</b>
        <input placeholder="Nombre" value={f.nombre} onChange={set('nombre')} required />
        <input type="email" placeholder="Email (es su usuario)" value={f.email} onChange={set('email')} required />
        <input placeholder="Contraseña (mín. 6)" value={f.password} onChange={set('password')} minLength={6} required />
        <select value={f.rol} onChange={set('rol')}>
          <option value="contador">Contador (solo cuenta)</option>
          <option value="admin">Administrador</option>
        </select>
        <button className="primary" disabled={busy}>Crear usuario</button>
        {msg && <div className={msg === 'Usuario creado.' ? 'muted' : 'err'}>{msg}</div>}
      </form>

      <div className="card">
        {users.map((u) => (
          <div key={u.id} className="item" style={{ cursor: 'default' }}>
            <div><b>{u.nombre}</b><span className="muted">{u.rol}{u.activo ? '' : ' · desactivado'}</span></div>
            {u.id !== me.id && <button onClick={() => toggle(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
          </div>
        ))}
      </div>
    </>
  )
}

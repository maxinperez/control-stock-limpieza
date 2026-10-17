import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { flush, getPending } from './offline'
import Login from './pages/Login'
import Conteo from './pages/Conteo'
import Productos from './pages/Productos'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('conteo')
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(getPending().length)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])

  const sync = useCallback(async () => {
    if (!navigator.onLine) return
    await flush()
    setPending(getPending().length)
  }, [])

  useEffect(() => {
    const on = () => { setOnline(true); sync() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const t = setInterval(() => { setPending(getPending().length); sync() }, 15000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(t)
    }
  }, [sync])

  if (session === undefined) return <div className="app"><p className="muted">Cargando…</p></div>
  if (!session) return <Login />
  if (!profile) return <div className="app"><p className="muted">Cargando perfil…</p></div>
  if (!profile.activo) {
    return (
      <div className="app">
        <div className="card">Tu usuario está desactivado. Consultá con el administrador.</div>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </div>
    )
  }

  const admin = profile.rol === 'admin'
  const tabs = [['conteo', 'Conteo'], ...(admin ? [['productos', 'Productos'], ['reportes', 'Reportes'], ['usuarios', 'Usuarios']] : [])]

  return (
    <div className="app">
      <div className="top">
        <h1>Control de Stock</h1>
        <div className="row">
          <span className="muted">{profile.nombre}</span>
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>

      {!online && <div className="banner">Sin conexión: tus cargas se guardan en el teléfono y se envían solas al volver la señal.</div>}
      {pending > 0 && <div className="banner">{pending} carga(s) pendientes de enviar.</div>}

      {tab === 'conteo' && <Conteo profile={profile} onChange={() => setPending(getPending().length)} />}
      {tab === 'productos' && admin && <Productos />}
      {tab === 'reportes' && admin && <Reportes />}
      {tab === 'usuarios' && admin && <Usuarios me={profile} />}

      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
      )}
    </div>
  )
}

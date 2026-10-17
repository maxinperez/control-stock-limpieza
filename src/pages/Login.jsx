import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr('Email o contraseña incorrectos')
    setBusy(false)
  }

  return (
    <div className="app">
      <form className="card stack" style={{ marginTop: 60 }} onSubmit={submit}>
        <h1 style={{ margin: 0 }}>Control de Stock</h1>
        <input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

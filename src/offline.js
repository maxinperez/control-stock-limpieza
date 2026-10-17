// Modo sin conexión: las cargas se guardan en el dispositivo y se envían cuando hay señal.
// Cada carga tiene un id propio (uuid), así reenviarla nunca la duplica.
import { supabase } from './supabase'

const QUEUE_KEY = 'cs_pending'
const CACHE_KEY = 'cs_cache'

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sin espacio: se ignora */ }
}

export const getPending = () => read(QUEUE_KEY, [])

export function enqueue(mov) {
  write(QUEUE_KEY, [...getPending(), mov])
}

// Devuelve { sent, left, error }
export async function flush() {
  const pending = getPending()
  if (!pending.length) return { sent: 0, left: 0 }
  const { error } = await supabase
    .from('conteo_movimientos')
    .upsert(pending, { onConflict: 'id', ignoreDuplicates: true })
  if (error) return { sent: 0, left: pending.length, error: error.message }
  const ids = new Set(pending.map((p) => p.id))
  write(QUEUE_KEY, getPending().filter((p) => !ids.has(p.id)))
  return { sent: pending.length, left: getPending().length }
}

export const getCache = () => read(CACHE_KEY, null)
export const setCache = (value) => write(CACHE_KEY, value)

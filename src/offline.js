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

// Error de una regla de la base (no de red): reintentar no sirve, la carga se descarta.
// P0 = regla del trigger/funciones, 22 = dato inválido, 23 = integridad, 42 = permiso/RLS (conteo cerrado).
const esRechazo = (error) => /^(P0|22|23|42)/.test(String(error?.code ?? ''))

const quitar = (ids) => write(QUEUE_KEY, getPending().filter((p) => !ids.has(p.id)))
const enviar = (filas) => supabase
  .from('conteo_movimientos')
  .upsert(filas, { onConflict: 'id', ignoreDuplicates: true })

// Devuelve { sent, left, rechazadas, error }
export async function flush() {
  const pending = getPending()
  if (!pending.length) return { sent: 0, left: 0, rechazadas: 0 }

  const { error } = await enviar(pending)
  if (!error) {
    quitar(new Set(pending.map((p) => p.id)))
    return { sent: pending.length, left: getPending().length, rechazadas: 0 }
  }
  // Error de red: se conserva todo para reintentar más tarde
  if (!esRechazo(error)) return { sent: 0, left: pending.length, rechazadas: 0, error: error.message }

  // Una carga rechazada no debe trabar al resto: se reintenta de a una
  let sent = 0
  let rechazadas = 0
  let errorRed
  const resueltas = new Set()
  for (const m of pending) {
    const { error: e } = await enviar([m])
    if (!e) { sent++; resueltas.add(m.id) } else if (esRechazo(e)) { rechazadas++; resueltas.add(m.id) } else { errorRed = e.message; break }
  }
  quitar(resueltas)
  if (rechazadas) write(RECHAZADAS_KEY, getRechazadas() + rechazadas)
  return { sent, left: getPending().length, rechazadas, ...(errorRed ? { error: errorRed } : {}) }
}

// Cargas descartadas por la base, acumuladas hasta que la pantalla las informe.
const RECHAZADAS_KEY = 'cs_rechazadas'
export const getRechazadas = () => Number(read(RECHAZADAS_KEY, 0)) || 0
export const limpiarRechazadas = () => write(RECHAZADAS_KEY, 0)

export const getCache = () => read(CACHE_KEY, null)
export const setCache = (value) => write(CACHE_KEY, value)

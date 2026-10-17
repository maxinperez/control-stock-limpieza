import { useEffect, useRef, useState } from 'react'

// Escaneo de códigos de barras con la cámara (BarcodeDetector: Chrome en Android).
export default function Scanner({ onDetect, onClose }) {
  const video = useRef(null)
  const cb = useRef(onDetect)
  cb.current = onDetect
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setMsg('Este navegador no soporta escaneo. Usá Chrome en Android o buscá el producto a mano.')
      return
    }
    let stream, timer, done = false
    const detector = new window.BarcodeDetector()
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s
        video.current.srcObject = s
        await video.current.play()
        timer = setInterval(async () => {
          if (done) return
          try {
            const found = await detector.detect(video.current)
            if (found.length) { done = true; cb.current(found[0].rawValue) }
          } catch { /* frame no listo */ }
        }, 300)
      })
      .catch(() => setMsg('No se pudo abrir la cámara. Revisá el permiso del navegador.'))
    return () => {
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="modal">
      <div>
        <h3 style={{ marginTop: 0 }}>Escanear código</h3>
        {msg ? <p className="err">{msg}</p> : <video ref={video} playsInline muted />}
        <button style={{ marginTop: 12, width: '100%' }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

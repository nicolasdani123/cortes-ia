import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** Controla o <video> original: pular para um ponto ou tocar só um trecho (pausa sozinho no fim). */
export function useTocarTrecho(videoRef: RefObject<HTMLVideoElement | null>) {
  const pararRef = useRef<(() => void) | null>(null)

  const limpar = useCallback(() => {
    pararRef.current?.()
    pararRef.current = null
  }, [])

  useEffect(() => limpar, [limpar])

  const irPara = useCallback(
    (segundos: number) => {
      const video = videoRef.current
      if (!video) return
      limpar()
      video.currentTime = segundos
      void video.play()
    },
    [videoRef, limpar],
  )

  const tocarTrecho = useCallback(
    (start: number, end: number) => {
      const video = videoRef.current
      if (!video) return
      irPara(start)
      const onTimeUpdate = () => {
        if (video.currentTime >= end) {
          video.pause()
          limpar()
        }
      }
      video.addEventListener('timeupdate', onTimeUpdate)
      pararRef.current = () => video.removeEventListener('timeupdate', onTimeUpdate)
      video.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
    [videoRef, irPara, limpar],
  )

  return { irPara, tocarTrecho }
}

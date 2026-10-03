export const FORMATOS_ACEITOS = ['mp4', 'mov', 'webm', 'mkv'] as const
export const ACCEPT_INPUT = '.mp4,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm,video/x-matroska'
export const LIMITE_AVISO_BYTES = 1024 ** 3

export function isFormatoAceito(file: File): boolean {
  const extensao = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (FORMATOS_ACEITOS as readonly string[]).includes(extensao)
}

export function tituloDoArquivo(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
}

/**
 * Lê a duração pelo elemento <video> do navegador.
 * Retorna null se o navegador não conseguir abrir o codec (ex.: alguns .mov);
 * nesse caso a duração é obtida depois pelo ffmpeg.
 */
export function lerDuracaoVideo(file: File, timeoutMs = 15_000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const finalizar = (duracao: number | null) => {
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(duracao)
    }

    const timer = window.setTimeout(() => finalizar(null), timeoutMs)
    video.onloadedmetadata = () =>
      finalizar(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null)
    video.onerror = () => finalizar(null)
    video.src = url
  })
}

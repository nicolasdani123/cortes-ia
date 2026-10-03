import { z } from 'zod'

// Conversa com o servidor que roda o yt-dlp (server/youtube.ts). Com VITE_YOUTUBE_API_URL ele fica no
// Render (server/standalone.ts); sem ela, é o próprio npm run dev/preview no PC.
const SERVIDOR_REMOTO = String(import.meta.env.VITE_YOUTUBE_API_URL ?? '').replace(/\/$/, '')

const jobSchema = z.object({
  status: z.enum(['BAIXANDO', 'PRONTO', 'ERRO']),
  progresso: z.number(),
  titulo: z.string().nullable(),
  duracaoSegundos: z.number().nullable(),
  erro: z.string().nullable(),
})

const INTERVALO_CONSULTA_MS = 1000

export function isLinkYoutube(texto: string): boolean {
  try {
    const { hostname } = new URL(texto.trim())
    return /(^|\.)(youtube\.com|youtu\.be)$/.test(hostname)
  } catch {
    return false
  }
}

async function lerErro(response: Response, servidor: string): Promise<string> {
  const corpo: unknown = await response.json().catch(() => null)
  if (typeof corpo === 'object' && corpo !== null && 'erro' in corpo && typeof corpo.erro === 'string') {
    return corpo.erro
  }
  return `Erro ${response.status} no ${servidor}.`
}

async function api(caminho: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${SERVIDOR_REMOTO}/api/youtube${caminho}`, init)
  } catch (error) {
    throw new Error(
      SERVIDOR_REMOTO
        ? 'Não foi possível falar com o servidor de download. Tente de novo em alguns segundos.'
        : 'Servidor local fora do ar. Rode "npm run dev" no seu PC.',
      { cause: error },
    )
  }
  // No site publicado (Firebase) a rota cai no index.html em vez da API.
  if (response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error('Baixar pelo link só funciona rodando o app no seu PC (npm run dev).')
  }
  if (!response.ok) throw new Error(await lerErro(response, SERVIDOR_REMOTO ? 'servidor de download' : 'servidor local'))
  return response
}

export interface VideoDoYoutube {
  arquivo: File
  titulo: string
  duracaoSegundos: number | null
}

/** Pede o download ao servidor local, acompanha o progresso (0 a 1) e devolve o .mp4. */
export async function baixarDoYoutube(url: string, onProgress: (fracao: number) => void): Promise<VideoDoYoutube> {
  const { id } = z.object({ id: z.string() }).parse(
    await (
      await api('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
    ).json(),
  )

  for (;;) {
    const job = jobSchema.parse(await (await api(`/jobs/${id}`)).json())
    if (job.status === 'ERRO') throw new Error(job.erro ?? 'O download falhou.')
    onProgress(job.progresso / 100)
    if (job.status === 'PRONTO') {
      const blob = await (await api(`/jobs/${id}/arquivo`)).blob()
      const titulo = job.titulo?.trim() || 'Vídeo do YouTube'
      return {
        arquivo: new File([blob], `${titulo}.mp4`, { type: 'video/mp4' }),
        titulo,
        duracaoSegundos: job.duracaoSegundos,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_CONSULTA_MS))
  }
}

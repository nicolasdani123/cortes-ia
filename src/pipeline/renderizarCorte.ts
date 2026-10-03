import { db, lerVideo, type Clip } from '@/db'
import { apagarArquivos, exclusivo, execFFmpeg, lerArquivo, montarBlob, THREADS_X264 } from '@/ffmpeg/client'
import { baixarBlob, nomeDeArquivo } from '@/lib/download'
import { LIMITE_FFMPEG_BYTES } from './mp4Audio'

/** Recorta o trecho do vídeo original em mp4 (H.264 + AAC), reencodando para o corte ser exato. */
async function recortar(video: Blob, clip: Clip): Promise<Blob> {
  if (video.size >= LIMITE_FFMPEG_BYTES) {
    throw new Error('O vídeo tem 2 GB ou mais e o ffmpeg do navegador não consegue abri-lo para gerar o corte.')
  }
  const duracao = clip.end - clip.start
  const saida = `/corte-${clip.id}.mp4`
  const entrada = await montarBlob(video, 'video')
  try {
    // -ss antes do -i busca rápido pelo keyframe e, com reencode, o corte continua exato.
    await execFFmpeg(
      [
        '-ss', String(clip.start), '-i', entrada.caminho, '-t', String(duracao),
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', THREADS_X264,
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        saida,
      ],
      { duracaoSaida: duracao },
    )
    return await lerArquivo(saida, 'video/mp4')
  } finally {
    await apagarArquivos(saida)
    await entrada.desmontar()
  }
}

/** Salva o corte na pasta de downloads do navegador. */
export function baixarCorte(clip: Clip): void {
  if (!clip.outputBlob) return
  baixarBlob(clip.outputBlob, `${nomeDeArquivo(clip.titulo, 'corte')}.mp4`)
}

async function renderizar(clipId: string): Promise<void> {
  const clip = await db.clips.get(clipId)
  if (!clip) return
  const project = await db.projects.get(clip.projectId)
  if (!project) return

  await db.clips.update(clipId, { status: 'RENDERING', erro: null })
  try {
    const video = await lerVideo(project)
    if (!video) throw new Error('Vídeo do projeto não encontrado.')
    const outputBlob = await exclusivo(() => recortar(video, clip))
    // O projeto pode ter sido excluído durante a renderização.
    const atualizados = await db.clips.update(clipId, { status: 'DONE', outputBlob })
    if (atualizados) baixarCorte({ ...clip, outputBlob })
  } catch (error) {
    console.error('[corte] renderização falhou', error)
    await db.clips.update(clipId, {
      status: 'FAILED',
      erro: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Renderiza os cortes um a um e baixa cada um assim que fica pronto. Também serve para "Tentar de novo". */
export async function renderizarCortes(clipIds: string[]): Promise<void> {
  for (const id of clipIds) await renderizar(id)
}

/** Ao abrir o app, cortes que ficaram pela metade (aba fechada) viram FAILED para permitir tentar de novo. */
export async function marcarCortesInterrompidos(): Promise<void> {
  await db.clips
    .where('status')
    .anyOf(['PENDING', 'RENDERING'])
    .modify({ status: 'FAILED', erro: 'A renderização foi interrompida porque a aba foi fechada ou recarregada.' })
}

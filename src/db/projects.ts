import Dexie from 'dexie'
import { db } from './index'
import type { Project } from './types'

// O Dexie às vezes embrulha o QuotaExceededError dentro de um AbortError.
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === Dexie.errnames.QuotaExceeded) return true
  return error instanceof Dexie.DexieError && error.inner?.name === Dexie.errnames.QuotaExceeded
}

interface NovoProjeto {
  titulo: string
  video: File
  duracaoSegundos: number | null
}

export async function createProject({ titulo, video, duracaoSegundos }: NovoProjeto): Promise<string> {
  // Pede ao navegador para não apagar os dados do app quando faltar espaço.
  await navigator.storage?.persist?.().catch(() => false)

  const project: Project = {
    id: crypto.randomUUID(),
    titulo,
    status: 'UPLOADED',
    progresso: 0,
    // 0 = desconhecida; preenchida pelo ffmpeg na extração de áudio.
    duracaoSegundos: duracaoSegundos ?? 0,
    tamanhoVideo: video.size,
    erro: null,
    etapaComFalha: null,
    createdAt: new Date(),
  }

  try {
    await db.transaction('rw', db.projects, db.videos, async () => {
      await db.projects.add(project)
      await db.videos.add({ projectId: project.id, blob: video })
    })
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error('Sem espaço no navegador para salvar esse vídeo. Exclua projetos antigos e tente de novo.')
    }
    throw error
  }
  return project.id
}

import Dexie, { type EntityTable } from 'dexie'
import type { Audio, Clip, Mensagem, Project, Transcript, Video } from './types'

export class CorteIADatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>
  videos!: EntityTable<Video, 'projectId'>
  audios!: EntityTable<Audio, 'id'>
  transcripts!: EntityTable<Transcript, 'id'>
  clips!: EntityTable<Clip, 'id'>
  mensagens!: EntityTable<Mensagem, 'id'>

  constructor() {
    super('corteia')
    // Só os campos listados aqui são indexados; os demais (inclusive Blobs) são armazenados normalmente.
    this.version(1).stores({
      projects: 'id, status, createdAt',
      transcripts: 'id, projectId',
      clips: 'id, projectId, [projectId+score], status',
    })
    this.version(2).stores({
      audios: 'id, projectId',
    })
    this.version(3).stores({
      mensagens: 'id, [projectId+createdAt], status',
    })
    // Sem migração aqui: copiar vídeos de GBs dentro do upgrade pode falhar e impedir o app de abrir.
    // Os projetos antigos são movidos um a um por moverVideoLegado().
    this.version(4).stores({
      videos: 'projectId',
    })
  }
}

export const db = new CorteIADatabase()

/** Vídeo do projeto, com fallback para projetos antigos que ainda o guardam no próprio registro. */
export async function lerVideo(project: Project): Promise<Blob | null> {
  return (await db.videos.get(project.id))?.blob ?? project.videoBlob ?? null
}

/** Move o vídeo de um projeto antigo para a tabela `videos` (uma cópia só, feita uma vez). */
export async function moverVideoLegado(project: Project): Promise<void> {
  const blob = project.videoBlob
  if (!blob) return
  try {
    await db.transaction('rw', db.videos, db.projects, async () => {
      await db.videos.put({ projectId: project.id, blob })
      await db.projects.update(project.id, { videoBlob: undefined, tamanhoVideo: blob.size })
    })
  } catch (error) {
    throw new Error(
      'Não foi possível converter este projeto antigo para o formato novo. Exclua o projeto e envie o vídeo de novo.',
      { cause: error },
    )
  }
}

/** Remove o projeto e tudo que pertence a ele (vídeo, áudio, transcrição, clips e chat). */
export async function deleteProject(projectId: string): Promise<void> {
  const tabelas = [db.projects, db.videos, db.audios, db.transcripts, db.clips, db.mensagens]
  await db.transaction('rw', tabelas, async () => {
    await db.videos.delete(projectId)
    await db.mensagens.where('[projectId+createdAt]').between([projectId, Dexie.minKey], [projectId, Dexie.maxKey]).delete()
    await db.clips.where('projectId').equals(projectId).delete()
    await db.transcripts.where('projectId').equals(projectId).delete()
    await db.audios.where('projectId').equals(projectId).delete()
    await db.projects.delete(projectId)
  })
}

export * from './types'

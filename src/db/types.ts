/**
 * O projeto só passa pelas etapas automáticas (áudio e transcrição).
 * Depois de READY, os cortes são pedidos no chat e cada clip tem o próprio status.
 */
export const PROJECT_STATUSES = ['UPLOADED', 'EXTRACTING_AUDIO', 'TRANSCRIBING', 'READY', 'FAILED'] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const CLIP_STATUSES = ['PENDING', 'RENDERING', 'DONE', 'FAILED'] as const

export type ClipStatus = (typeof CLIP_STATUSES)[number]

export interface Project {
  id: string
  titulo: string
  status: ProjectStatus
  /** 0 a 100, referente à etapa atual. */
  progresso: number
  duracaoSegundos: number
  /** Tamanho do vídeo em bytes (o arquivo fica na tabela `videos`). Ausente em projetos antigos. */
  tamanhoVideo?: number
  /**
   * Só em projetos criados antes da tabela `videos`. Com o vídeo aqui, todo update no projeto
   * (ex.: progresso) regrava o vídeo inteiro; o runner move para `videos` antes de processar.
   */
  videoBlob?: Blob
  erro: string | null
  /** Etapa que falhou, usada pelo botão "Tentar de novo". */
  etapaComFalha: ProjectStatus | null
  createdAt: Date
}

/** Vídeo original, separado do projeto para que atualizar o projeto não regrave o arquivo. */
export interface Video {
  projectId: string
  blob: Blob
}

export interface ParteAudio {
  blob: Blob
  /** Onde a parte começa no vídeo original, em segundos. */
  inicio: number
}

/** Áudio extraído (mono, 16 kHz, mp3), guardado para permitir refazer só a transcrição. */
export interface Audio {
  id: string
  projectId: string
  partes: ParteAudio[]
}

export interface Palavra {
  palavra: string
  start: number
  end: number
}

export interface Segmento {
  start: number
  end: number
  texto: string
  palavras: Palavra[]
}

export interface Transcript {
  id: string
  projectId: string
  segmentos: Segmento[]
}

export interface Clip {
  id: string
  projectId: string
  start: number
  end: number
  titulo: string
  gancho: string
  motivo: string
  categoria: string
  score: number
  status: ClipStatus
  outputBlob: Blob | null
  /** Motivo da falha na renderização (status FAILED). Ausente em clips antigos. */
  erro?: string | null
  createdAt: Date
}

export type PapelMensagem = 'user' | 'assistant'

/** PENDENTE = a IA ainda está respondendo. */
export type StatusMensagem = 'PENDENTE' | 'OK' | 'ERRO'

export interface Mensagem {
  id: string
  projectId: string
  papel: PapelMensagem
  texto: string
  status: StatusMensagem
  /** Cortes sugeridos nesta resposta (só mensagens da IA). */
  clipIds: string[]
  createdAt: Date
}

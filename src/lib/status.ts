import type { ProjectStatus } from '@/db'

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  UPLOADED: 'Aguardando',
  EXTRACTING_AUDIO: 'Extraindo áudio',
  TRANSCRIBING: 'Transcrevendo',
  READY: 'Pronto para cortar',
  FAILED: 'Falhou',
}

/** Etapas automáticas, na ordem em que rodam. */
export const ETAPAS_PROCESSAMENTO = ['EXTRACTING_AUDIO', 'TRANSCRIBING'] as const satisfies readonly ProjectStatus[]

export type EtapaProcessamento = (typeof ETAPAS_PROCESSAMENTO)[number]

export function isEtapaProcessamento(status: ProjectStatus | null): status is EtapaProcessamento {
  return (ETAPAS_PROCESSAMENTO as readonly (ProjectStatus | null)[]).includes(status)
}

export type StatusTom = 'neutro' | 'processando' | 'sucesso' | 'erro'

export function statusTom(status: ProjectStatus): StatusTom {
  switch (status) {
    case 'UPLOADED':
      return 'neutro'
    case 'READY':
      return 'sucesso'
    case 'FAILED':
      return 'erro'
    case 'EXTRACTING_AUDIO':
    case 'TRANSCRIBING':
      return 'processando'
  }
}

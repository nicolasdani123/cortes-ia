import { create } from 'zustand'
import { db, lerVideo, moverVideoLegado, type Project } from '@/db'
import { exclusivo, terminateFFmpeg } from '@/ffmpeg/client'
import { ETAPAS_PROCESSAMENTO, isEtapaProcessamento, type EtapaProcessamento } from '@/lib/status'
import { useConfigStore } from '@/stores/config'
import { extrairAudio } from './extractAudio'
import { transcrever } from './transcribe'

interface PipelineState {
  /** Projeto sendo processado agora (um por vez, pois o ffmpeg.wasm é uma instância só). */
  ativo: string | null
  fila: string[]
}

export const usePipelineStore = create<PipelineState>(() => ({ ativo: null, fila: [] }))

export const useIsProcessando = (projectId: string) =>
  usePipelineStore((s) => s.ativo === projectId || s.fila.includes(projectId))

type ReportarProgresso = (fracao: number) => void

const EXECUTORES: Record<EtapaProcessamento, (project: Project, progresso: ReportarProgresso) => Promise<void>> = {
  EXTRACTING_AUDIO: async (project, progresso) => {
    const video = await lerVideo(project)
    if (!video) throw new Error('Vídeo do projeto não encontrado. Exclua e envie o vídeo de novo.')
    const { partes, duracaoSegundos } = await exclusivo(() => extrairAudio(video, progresso))
    await db.transaction('rw', db.audios, db.projects, async () => {
      await db.audios.where('projectId').equals(project.id).delete()
      await db.audios.add({ id: crypto.randomUUID(), projectId: project.id, partes })
      if (duracaoSegundos) await db.projects.update(project.id, { duracaoSegundos })
    })
  },
  TRANSCRIBING: async (project, progresso) => {
    const { apiKey } = useConfigStore.getState()
    if (!apiKey) throw new Error('Configure a chave do Groq em Configurações.')
    const audio = await db.audios.where('projectId').equals(project.id).first()
    if (!audio) throw new Error('Áudio extraído não encontrado. Exclua e envie o vídeo de novo.')

    const segmentos = await transcrever(apiKey, audio.partes, progresso)
    if (segmentos.length === 0) {
      throw new Error('Nenhuma fala foi reconhecida no vídeo. Confira se o áudio tem voz audível.')
    }
    await db.transaction('rw', db.transcripts, async () => {
      await db.transcripts.where('projectId').equals(project.id).delete()
      await db.transcripts.add({ id: crypto.randomUUID(), projectId: project.id, segmentos })
    })
  },
}

/** Se o projeto falhou, recomeça da etapa que falhou; se foi interrompido, da etapa em que estava. */
function etapaInicial(project: Project): EtapaProcessamento | null {
  if (project.status === 'UPLOADED') return ETAPAS_PROCESSAMENTO[0]
  if (project.status === 'FAILED') return isEtapaProcessamento(project.etapaComFalha) ? project.etapaComFalha : ETAPAS_PROCESSAMENTO[0]
  if (isEtapaProcessamento(project.status)) return project.status
  return null
}

function criarReportador(projectId: string): ReportarProgresso {
  let ultimo = -1
  return (fracao) => {
    // Grava no IndexedDB só quando o percentual inteiro muda, para não sobrecarregar.
    const pct = Math.round(fracao * 100)
    if (pct === ultimo) return
    ultimo = pct
    void db.projects.update(projectId, { progresso: pct })
  }
}

let cancelado: string | null = null

async function processar(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId)
  if (!project) return
  const inicio = etapaInicial(project)
  if (!inicio) return

  let etapaAtual: EtapaProcessamento = inicio
  try {
    // Antes de qualquer update de progresso, que regravaria o vídeo de um projeto antigo a cada 1%.
    await moverVideoLegado(project)
    for (const etapa of ETAPAS_PROCESSAMENTO.slice(ETAPAS_PROCESSAMENTO.indexOf(inicio))) {
      etapaAtual = etapa
      await db.projects.update(projectId, { status: etapa, progresso: 0, erro: null, etapaComFalha: null })
      // Relê o projeto: etapas anteriores podem ter atualizado dados (ex.: duração).
      const atualizado = await db.projects.get(projectId)
      if (!atualizado) return
      await EXECUTORES[etapa](atualizado, criarReportador(projectId))
    }
    await db.projects.update(projectId, { status: 'READY', progresso: 100 })
  } catch (error) {
    if (cancelado === projectId) return
    console.error(`[pipeline] ${etapaAtual} falhou`, error)
    await db.projects.update(projectId, {
      status: 'FAILED',
      erro: error instanceof Error ? error.message : String(error),
      etapaComFalha: etapaAtual,
    })
  }
}

async function drenarFila(): Promise<void> {
  if (usePipelineStore.getState().ativo) return
  let proximo = usePipelineStore.getState().fila[0]
  while (proximo) {
    usePipelineStore.setState((s) => ({ ativo: proximo ?? null, fila: s.fila.slice(1) }))
    await processar(proximo)
    cancelado = null
    usePipelineStore.setState({ ativo: null })
    proximo = usePipelineStore.getState().fila[0]
  }
}

/** Coloca o projeto na fila; também serve para "Tentar de novo". */
export function iniciarProcessamento(projectId: string): void {
  const { ativo, fila } = usePipelineStore.getState()
  if (ativo === projectId || fila.includes(projectId)) return
  usePipelineStore.setState({ fila: [...fila, projectId] })
  void drenarFila()
}

/** Tira o projeto da fila e, se estiver rodando, mata o ffmpeg. Usado ao excluir. */
export function cancelarProcessamento(projectId: string): void {
  const { ativo, fila } = usePipelineStore.getState()
  usePipelineStore.setState({ fila: fila.filter((id) => id !== projectId) })
  if (ativo === projectId) {
    cancelado = projectId
    terminateFFmpeg()
  }
}

/**
 * Ao abrir o app, nada está rodando: projetos que ficaram no meio de uma etapa
 * (aba fechada ou recarregada) viram FAILED para mostrar o "Tentar de novo".
 *
 * Projetos antigos com o vídeo no próprio registro ficam de fora: atualizá-los regrava o vídeo
 * inteiro, e com vídeos grandes isso trava a abertura do app (o main.tsx espera esta função).
 */
export async function marcarInterrompidos(): Promise<void> {
  await db.projects
    .where('status')
    .anyOf([...ETAPAS_PROCESSAMENTO])
    .filter((project) => !project.videoBlob)
    .modify((project) => {
      project.etapaComFalha = project.status
      project.status = 'FAILED'
      project.erro = 'O processamento foi interrompido porque a aba foi fechada ou recarregada.'
    })
}

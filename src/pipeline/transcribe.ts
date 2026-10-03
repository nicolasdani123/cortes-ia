import type { ParteAudio, Segmento } from '@/db'
import { transcreverAudio } from '@/lib/groq'
import { montarSegmentos } from './montarTranscricao'

/** Transcreve as partes em sequência e junta tudo numa linha do tempo só. */
export async function transcrever(
  apiKey: string,
  partes: ParteAudio[],
  onProgress: (fracao: number) => void,
): Promise<Segmento[]> {
  const segmentos: Segmento[] = []
  for (const [i, parte] of partes.entries()) {
    const resposta = await transcreverAudio(apiKey, parte.blob)
    segmentos.push(...montarSegmentos(resposta, parte.inicio))
    onProgress((i + 1) / partes.length)
  }
  return segmentos
}

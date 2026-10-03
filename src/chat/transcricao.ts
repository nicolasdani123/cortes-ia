import type { Segmento } from '@/db'

/** Estimativa conservadora (português costuma dar ~4 caracteres por token). */
export const estimarTokens = (texto: string) => Math.ceil(texto.length / 3)

/** Trecho curto da fala (até uma vírgula ou ponto), com tempos tirados das palavras. */
export interface Frase {
  start: number
  end: number
  texto: string
}

const FIM_DE_FRASE = /[,.;:!?…]$/

/**
 * Quebra os segmentos do Whisper em frases. Um segmento pode misturar coisas diferentes
 * (ex.: "Agora vem o refrão, eu quero ser feliz"); com tempos por frase a IA consegue
 * começar o corte exatamente onde o trecho pedido começa.
 */
export function segmentosEmFrases(segmentos: Segmento[]): Frase[] {
  return segmentos.flatMap((seg) => {
    if (seg.palavras.length === 0) return [{ start: seg.start, end: seg.end, texto: seg.texto }]

    const frases: Frase[] = []
    let atual: typeof seg.palavras = []
    const fechar = () => {
      const primeira = atual[0]
      const ultima = atual[atual.length - 1]
      if (primeira && ultima) {
        frases.push({ start: primeira.start, end: ultima.end, texto: atual.map((p) => p.palavra).join(' ') })
      }
      atual = []
    }
    for (const palavra of seg.palavras) {
      atual.push(palavra)
      if (FIM_DE_FRASE.test(palavra.palavra)) fechar()
    }
    fechar()
    return frases
  })
}

/** Formato enviado à IA: "[73.2-75.9] texto", uma frase por linha. */
export function formatarFrases(frases: Frase[]): string {
  return frases.map((f) => `[${f.start.toFixed(1)}-${f.end.toFixed(1)}] ${f.texto}`).join('\n')
}

export interface Bloco {
  frases: Frase[]
  inicio: number
  fim: number
}

/**
 * Divide as frases em blocos que caibam no orçamento de tokens, com sobreposição
 * (o último trecho de um bloco se repete no começo do próximo) para não perder cortes na emenda.
 */
export function dividirEmBlocos(frases: Frase[], maxTokens: number, sobreposicaoS: number): Bloco[] {
  const blocos: Bloco[] = []
  let inicioIdx = 0

  while (inicioIdx < frases.length) {
    let tokens = 0
    let fimIdx = inicioIdx
    while (fimIdx < frases.length) {
      const frase = frases[fimIdx]
      if (!frase) break
      const custo = estimarTokens(formatarFrases([frase])) + 1
      // Sempre inclui ao menos uma frase, mesmo que sozinha ela passe do orçamento.
      if (tokens + custo > maxTokens && fimIdx > inicioIdx) break
      tokens += custo
      fimIdx++
    }

    const doBloco = frases.slice(inicioIdx, fimIdx)
    const primeira = doBloco[0]
    const ultima = doBloco[doBloco.length - 1]
    if (!primeira || !ultima) break
    blocos.push({ frases: doBloco, inicio: primeira.start, fim: ultima.end })
    if (fimIdx >= frases.length) break

    // O próximo bloco recomeça "sobreposicaoS" antes do fim deste, mas sempre avança pelo menos uma frase.
    let proximo = fimIdx
    while (proximo - 1 > inicioIdx && (frases[proximo - 1]?.start ?? 0) > ultima.end - sobreposicaoS) proximo--
    inicioIdx = Math.max(proximo, inicioIdx + 1)
  }
  return blocos
}

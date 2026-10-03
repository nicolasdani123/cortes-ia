import type { Palavra, Segmento } from '@/db'
import type { WhisperResposta } from '@/lib/groq'

/**
 * Mesma heurística do Whisper original para descartar trechos sem fala: probabilidade alta de
 * "sem fala" junto com baixa confiança. Em música, os trechos instrumentais costumam gerar
 * frases inventadas ("Legendas pela comunidade Amara.org") que caem aqui.
 */
const NO_SPEECH_LIMITE = 0.6
const LOGPROB_LIMITE = -1

function ehAlucinacao(seg: WhisperResposta['segments'][number]): boolean {
  return (seg.no_speech_prob ?? 0) > NO_SPEECH_LIMITE && (seg.avg_logprob ?? 0) < LOGPROB_LIMITE
}

/** Se a API não devolver palavras, distribui o tempo do segmento igualmente entre as palavras do texto. */
function palavrasEstimadas(texto: string, start: number, end: number): Palavra[] {
  const tokens = texto.split(/\s+/).filter(Boolean)
  const passo = (end - start) / Math.max(1, tokens.length)
  return tokens.map((palavra, i) => ({ palavra, start: start + i * passo, end: start + (i + 1) * passo }))
}

/**
 * Converte a resposta do Whisper de uma parte do áudio em segmentos com palavras,
 * já com os tempos deslocados para a posição da parte no vídeo.
 */
export function montarSegmentos(resposta: WhisperResposta, offset: number): Segmento[] {
  const segs = resposta.segments.filter((s) => s.text.trim().length > 0)
  const grupos: Palavra[][] = segs.map(() => [])

  // Cada palavra vai para o segmento que contém o seu ponto médio (ou o mais próximo, se cair num intervalo).
  let i = 0
  for (const w of resposta.words) {
    const meio = (w.start + w.end) / 2
    while (i < segs.length - 1 && meio >= (segs[i]?.end ?? 0)) {
      const proximo = segs[i + 1]
      const atual = segs[i]
      if (!proximo || !atual) break
      // Entre dois segmentos: fica no mais próximo.
      if (meio < proximo.start && meio - atual.end < proximo.start - meio) break
      i++
    }
    const palavra = w.word.trim()
    if (palavra) grupos[i]?.push({ palavra, start: w.start + offset, end: w.end + offset })
  }

  const usarEstimativa = resposta.words.length === 0
  return segs.flatMap((seg, idx) => {
    if (ehAlucinacao(seg)) return []
    const texto = seg.text.trim()
    const start = seg.start + offset
    const end = seg.end + offset
    const palavras = usarEstimativa ? palavrasEstimadas(texto, start, end) : (grupos[idx] ?? [])
    return [{ start, end, texto, palavras }]
  })
}

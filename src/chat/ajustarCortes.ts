import type { Palavra } from '@/db'

export interface CorteBruto {
  start: number
  end: number
  titulo: string
  gancho: string
  motivo: string
  categoria: string
  score: number
}

export const DURACAO_MINIMA_ABSOLUTA_S = 3
export const DURACAO_MAXIMA_ABSOLUTA_S = 180
/** Respiro no fim do corte, para a última palavra não ser cortada seca. */
export const RESPIRO_FINAL_S = 0.3

interface Opcoes {
  palavras: Palavra[]
  duracaoVideo: number
  maxCortes: number
}

/** Índice da palavra cujo valor (start ou end) é o mais próximo de `alvo`. `palavras` precisa estar ordenado. */
function maisProxima(palavras: Palavra[], alvo: number, campo: 'start' | 'end'): Palavra | undefined {
  let lo = 0
  let hi = palavras.length - 1
  while (lo < hi) {
    const meio = (lo + hi) >> 1
    if ((palavras[meio]?.[campo] ?? 0) < alvo) lo = meio + 1
    else hi = meio
  }
  const depois = palavras[lo]
  const antes = palavras[lo - 1]
  if (!antes) return depois
  if (!depois) return antes
  return Math.abs(antes[campo] - alvo) <= Math.abs(depois[campo] - alvo) ? antes : depois
}

/**
 * Valida e ajusta os cortes sugeridos pela IA:
 * encaixa início/fim nas palavras mais próximas, adiciona o respiro final, descarta cortes
 * fora do vídeo ou com duração absurda, remove sobreposições (fica o de maior score) e limita a quantidade.
 * Devolve ordenado por score, do maior para o menor.
 */
export function ajustarCortes(brutos: CorteBruto[], { palavras, duracaoVideo, maxCortes }: Opcoes): CorteBruto[] {
  const ajustados = brutos.flatMap((c) => {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start >= c.end) return []
    if (c.start < 0 || c.start >= duracaoVideo) return []

    const inicio = maisProxima(palavras, c.start, 'start')?.start ?? c.start
    const fimPalavra = maisProxima(palavras, Math.min(c.end, duracaoVideo), 'end')?.end ?? c.end
    const fim = Math.min(duracaoVideo, fimPalavra + RESPIRO_FINAL_S)
    const duracao = fim - inicio
    if (duracao < DURACAO_MINIMA_ABSOLUTA_S || duracao > DURACAO_MAXIMA_ABSOLUTA_S) return []

    const score = Math.max(0, Math.min(100, Math.round(c.score)))
    return [{ ...c, start: inicio, end: fim, score }]
  })

  const escolhidos: CorteBruto[] = []
  for (const c of [...ajustados].sort((a, b) => b.score - a.score)) {
    const sobrepoe = escolhidos.some((e) => c.start < e.end && e.start < c.end)
    if (!sobrepoe) escolhidos.push(c)
    if (escolhidos.length >= maxCortes) break
  }
  return escolhidos
}

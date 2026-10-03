import type { Segmento } from '@/db'
import { formatDuracao } from './format'

/** Texto corrido com o tempo de cada trecho: "[1:15] texto". */
export function transcricaoEmTxt(segmentos: Segmento[]): string {
  return segmentos.map((seg) => `[${formatDuracao(seg.start)}] ${seg.texto}`).join('\n') + '\n'
}

/** 75.5 → "00:01:15,500" (formato de tempo do SRT). */
function tempoSrt(segundos: number): string {
  const ms = Math.max(0, Math.round(segundos * 1000))
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`
}

/** Legenda .srt, que abre em editores de vídeo (Premiere, CapCut, DaVinci) e no YouTube. */
export function transcricaoEmSrt(segmentos: Segmento[]): string {
  return segmentos
    .map((seg, i) => `${i + 1}\n${tempoSrt(seg.start)} --> ${tempoSrt(seg.end)}\n${seg.texto}\n`)
    .join('\n')
}

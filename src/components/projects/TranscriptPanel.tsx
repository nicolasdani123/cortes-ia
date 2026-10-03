import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Segmento } from '@/db'
import { baixarBlob, nomeDeArquivo } from '@/lib/download'
import { formatDuracao } from '@/lib/format'
import { transcricaoEmSrt, transcricaoEmTxt } from '@/lib/transcricao'

interface TranscriptPanelProps {
  segmentos: Segmento[]
  /** Usado no nome do arquivo baixado. */
  titulo: string
  onSeek: (segundos: number) => void
}

export function TranscriptPanel({ segmentos, titulo, onSeek }: TranscriptPanelProps) {
  const totalPalavras = segmentos.reduce((n, s) => n + s.palavras.length, 0)

  function baixar(formato: 'txt' | 'srt') {
    const conteudo = formato === 'txt' ? transcricaoEmTxt(segmentos) : transcricaoEmSrt(segmentos)
    const nome = `${nomeDeArquivo(titulo, 'transcricao')}.${formato}`
    baixarBlob(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }), nome)
  }

  return (
    <div className="flex max-h-[60vh] flex-col rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4" /> Transcrição
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{totalPalavras} palavras</span>
          <Button variant="outline" size="sm" title="Texto com o tempo de cada trecho" onClick={() => baixar('txt')}>
            <Download /> TXT
          </Button>
          <Button variant="outline" size="sm" title="Legenda para editores de vídeo" onClick={() => baixar('srt')}>
            <Download /> SRT
          </Button>
        </div>
      </div>
      <ol className="flex-1 space-y-1 overflow-y-auto p-2">
        {segmentos.map((seg) => (
          <li key={seg.start}>
            <button
              type="button"
              onClick={() => onSeek(seg.start)}
              className="flex w-full gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <span className="w-12 shrink-0 pt-px text-xs tabular-nums text-primary">
                {formatDuracao(seg.start)}
              </span>
              <span className="text-muted-foreground">{seg.texto}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

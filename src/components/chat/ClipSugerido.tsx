import { Clock, Download, Loader2, Play, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Clip } from '@/db'
import { formatDuracao } from '@/lib/format'
import { baixarCorte, renderizarCortes } from '@/pipeline/renderizarCorte'

interface ClipSugeridoProps {
  clip: Clip
  numero: number
  onVerTrecho: (start: number, end: number) => void
}

/** Corte sugerido pela IA dentro de uma resposta do chat. */
export function ClipSugerido({ clip, numero, onVerTrecho }: ClipSugeridoProps) {
  const duracao = clip.end - clip.start

  return (
    <div className="space-y-2 rounded-lg border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="text-primary">#{numero}</span> {clip.titulo}
        </p>
        <Badge className="shrink-0 bg-primary/15 text-primary tabular-nums">{clip.score}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 tabular-nums">
          <Clock className="size-3" />
          {formatDuracao(clip.start)}–{formatDuracao(clip.end)} ({Math.round(duracao)}s)
        </span>
        <Badge variant="outline" className="capitalize">
          {clip.categoria}
        </Badge>
      </div>
      {clip.motivo && <p className="text-xs text-muted-foreground">{clip.motivo}</p>}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={() => onVerTrecho(clip.start, clip.end)}>
          <Play /> Ver no vídeo
        </Button>
        {/* A renderização vertical com legenda entra na Fase 6; por enquanto o corte sai no formato original. */}
        {clip.status === 'DONE' ? (
          <Button size="sm" variant="outline" onClick={() => baixarCorte(clip)}>
            <Download /> Baixar
          </Button>
        ) : clip.status === 'FAILED' ? (
          <Button size="sm" variant="outline" onClick={() => void renderizarCortes([clip.id])}>
            <RotateCcw /> Tentar de novo
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {clip.status === 'RENDERING' ? 'Gerando corte...' : 'Na fila'}
          </span>
        )}
      </div>
      {clip.status === 'FAILED' && clip.erro && <p className="text-xs text-destructive">{clip.erro}</p>}
    </div>
  )
}

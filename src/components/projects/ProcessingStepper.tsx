import { Check, Loader2, X } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { Project, ProjectStatus } from '@/db'
import { cn } from '@/lib/utils'

const PASSOS: { status: ProjectStatus; label: string }[] = [
  { status: 'UPLOADED', label: 'Envio' },
  { status: 'EXTRACTING_AUDIO', label: 'Extração do áudio' },
  { status: 'TRANSCRIBING', label: 'Transcrição' },
  { status: 'READY', label: 'Pronto para cortar' },
]

type EstadoPasso = 'feito' | 'atual' | 'falhou' | 'pendente'

function estadoDosPassos(project: Project): EstadoPasso[] {
  const falhou = project.status === 'FAILED'
  const statusAtual = falhou ? (project.etapaComFalha ?? 'EXTRACTING_AUDIO') : project.status
  const indiceAtual = PASSOS.findIndex((p) => p.status === statusAtual)

  return PASSOS.map((_, i) => {
    if (i < indiceAtual) return 'feito'
    if (i > indiceAtual) return 'pendente'
    if (falhou) return 'falhou'
    // "Envio" parado e "Pronto" são estados finais, não etapas em andamento.
    return statusAtual === 'READY' || statusAtual === 'UPLOADED' ? 'feito' : 'atual'
  })
}

export function ProcessingStepper({ project }: { project: Project }) {
  const estados = estadoDosPassos(project)

  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {PASSOS.map((passo, i) => {
        const estado = estados[i] ?? 'pendente'
        return (
          <li
            key={passo.status}
            className={cn(
              'space-y-2 rounded-lg border p-3',
              estado === 'atual' && 'border-primary/50 bg-primary/5',
              estado === 'falhou' && 'border-destructive/50 bg-destructive/5',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                  estado === 'feito' && 'bg-primary text-primary-foreground',
                  estado === 'atual' && 'bg-primary/20 text-primary',
                  estado === 'falhou' && 'bg-destructive text-white',
                  estado === 'pendente' && 'bg-secondary text-muted-foreground',
                )}
              >
                {estado === 'feito' && <Check className="size-3.5" />}
                {estado === 'atual' && <Loader2 className="size-3.5 animate-spin" />}
                {estado === 'falhou' && <X className="size-3.5" />}
                {estado === 'pendente' && i + 1}
              </span>
              <span className={cn('text-sm font-medium', estado === 'pendente' && 'text-muted-foreground')}>
                {passo.label}
              </span>
            </div>
            {estado === 'atual' && (
              <div className="flex items-center gap-2">
                <Progress value={project.progresso} className="flex-1" />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                  {project.progresso}%
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

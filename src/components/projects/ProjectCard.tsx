import { Clock, Film } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { Project } from '@/db'
import { formatData, formatDuracao } from '@/lib/format'
import { statusTom } from '@/lib/status'
import { DeleteProjectButton } from './DeleteProjectButton'
import { StatusBadge } from './StatusBadge'

export function ProjectCard({ project }: { project: Project }) {
  const processando = statusTom(project.status) === 'processando'

  return (
    <Card className="relative gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <Film className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          {/* O link cobre o card inteiro via ::after; o botão de excluir fica acima dele. */}
          <Link
            to={`/projetos/${project.id}`}
            className="block truncate font-medium after:absolute after:inset-0 after:content-['']"
          >
            {project.titulo}
          </Link>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {project.duracaoSegundos > 0 && (
              <>
                <Clock className="size-3" /> {formatDuracao(project.duracaoSegundos)} ·{' '}
              </>
            )}
            {formatData(project.createdAt)}
          </p>
        </div>
        <div className="relative z-10">
          <DeleteProjectButton projectId={project.id} titulo={project.titulo} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <StatusBadge status={project.status} />
        {processando && (
          <>
            <Progress value={project.progresso} className="flex-1" />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(project.progresso)}%
            </span>
          </>
        )}
      </div>

      {project.status === 'FAILED' && project.erro && (
        <p className="line-clamp-2 text-xs text-destructive">{project.erro}</p>
      )}
    </Card>
  )
}

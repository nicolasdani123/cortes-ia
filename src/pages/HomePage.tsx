import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2, Plus, Video } from 'lucide-react'
import { Link } from 'react-router'
import { ApiKeyAlert } from '@/components/ApiKeyAlert'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { useHasApiKey } from '@/stores/config'

export function HomePage() {
  const hasApiKey = useHasApiKey()
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Seus projetos</h1>
          <p className="text-sm text-muted-foreground">
            Envie um vídeo longo e receba cortes verticais com legenda.
          </p>
        </div>
        {hasApiKey ? (
          <Button asChild size="lg">
            <Link to="/novo">
              <Plus /> Novo corte
            </Link>
          </Button>
        ) : (
          <Button size="lg" disabled>
            <Plus /> Novo corte
          </Button>
        )}
      </div>

      <ApiKeyAlert />

      {projects === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Video className="size-10 text-muted-foreground" />
          <p className="font-medium">Nenhum projeto ainda</p>
          <p className="text-sm text-muted-foreground">Clique em "Novo corte" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

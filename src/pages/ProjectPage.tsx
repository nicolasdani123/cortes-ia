import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Loader2, OctagonX, Play, RotateCcw, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { DeleteProjectButton } from '@/components/projects/DeleteProjectButton'
import { ProcessingStepper } from '@/components/projects/ProcessingStepper'
import { StatusBadge } from '@/components/projects/StatusBadge'
import { TranscriptPanel } from '@/components/projects/TranscriptPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useTocarTrecho } from '@/hooks/useTocarTrecho'
import { formatBytes, formatData, formatDuracao } from '@/lib/format'
import { iniciarProcessamento, useIsProcessando } from '@/pipeline/runner'
import { PlaceholderPage } from './PlaceholderPage'

export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  // null = não existe; undefined = ainda carregando.
  const project = useLiveQuery(async () => (await db.projects.get(id)) ?? null, [id])
  const transcript = useLiveQuery(() => db.transcripts.where('projectId').equals(id).first(), [id])
  const videoRef = useRef<HTMLVideoElement>(null)
  const video = useLiveQuery(() => db.videos.get(id), [id])
  const videoUrl = useObjectUrl(video?.blob ?? project?.videoBlob, project?.id)
  const processando = useIsProcessando(id)
  const { irPara, tocarTrecho } = useTocarTrecho(videoRef)

  if (project === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (project === null) {
    return <PlaceholderPage titulo="Projeto não encontrado" descricao="Ele pode ter sido excluído." />
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/">
          <ArrowLeft /> Projetos
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{project.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {project.duracaoSegundos > 0 && `${formatDuracao(project.duracaoSegundos)} · `}
            {formatBytes(project.tamanhoVideo ?? video?.blob.size ?? project.videoBlob?.size ?? 0)} ·{' '}
            {formatData(project.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <DeleteProjectButton
            projectId={project.id}
            titulo={project.titulo}
            onDeleted={() => navigate('/')}
          >
            <Button variant="outline" size="sm">
              <Trash2 /> Excluir
            </Button>
          </DeleteProjectButton>
        </div>
      </div>

      <ProcessingStepper project={project} />

      {project.status === 'FAILED' && (
        <Alert variant="destructive">
          <OctagonX />
          <AlertTitle>O processamento falhou</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="break-words">{project.erro ?? 'Erro desconhecido.'}</p>
            <Button size="sm" variant="outline" disabled={processando} onClick={() => iniciarProcessamento(project.id)}>
              <RotateCcw /> Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {project.status === 'UPLOADED' && !processando && (
        <Button onClick={() => iniciarProcessamento(project.id)}>
          <Play /> Iniciar processamento
        </Button>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border bg-black">
            {videoUrl && <video ref={videoRef} src={videoUrl} controls className="mx-auto max-h-[60vh] w-full" />}
          </div>
          {transcript && <TranscriptPanel segmentos={transcript.segmentos} titulo={project.titulo} onSeek={irPara} />}
        </div>

        <div className="lg:sticky lg:top-20">
          <ChatPanel projectId={project.id} habilitado={project.status === 'READY'} onVerTrecho={tocarTrecho} />
        </div>
      </div>
    </div>
  )
}


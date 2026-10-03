import { FileVideo, Loader2, TriangleAlert, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiKeyAlert } from '@/components/ApiKeyAlert'
import { VideoDropzone } from '@/components/projects/VideoDropzone'
import { YoutubeLinkForm } from '@/components/projects/YoutubeLinkForm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { createProject } from '@/db/projects'
import { LIMITE_FFMPEG_BYTES } from '@/pipeline/mp4Audio'
import { iniciarProcessamento } from '@/pipeline/runner'
import { formatBytes } from '@/lib/format'
import { isFormatoAceito, lerDuracaoVideo, LIMITE_AVISO_BYTES, tituloDoArquivo } from '@/lib/video'
import type { VideoDoYoutube } from '@/lib/youtube'
import { useHasApiKey } from '@/stores/config'

export function NewProjectPage() {
  const hasApiKey = useHasApiKey()
  const navigate = useNavigate()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [salvando, setSalvando] = useState(false)

  function escolherArquivo(file: File) {
    if (!isFormatoAceito(file)) {
      toast.error('Formato não suportado. Envie um arquivo MP4, MOV, WEBM ou MKV.')
      return
    }
    if (file.size >= LIMITE_FFMPEG_BYTES && !/\.(mp4|mov)$/i.test(file.name)) {
      toast.error('Vídeos de 2 GB ou mais só funcionam em MP4 ou MOV. Converta o arquivo ou envie um menor.')
      return
    }
    setArquivo(file)
    setTitulo(tituloDoArquivo(file))
  }

  /** Pelo link não há o que revisar: cria o projeto e já começa a transcrever. */
  async function criarDoYoutube({ arquivo, titulo, duracaoSegundos }: VideoDoYoutube) {
    const id = await createProject({ titulo: titulo.slice(0, 120), video: arquivo, duracaoSegundos })
    iniciarProcessamento(id)
    navigate(`/projetos/${id}`)
  }

  async function criar(event: FormEvent) {
    event.preventDefault()
    if (!arquivo || !titulo.trim()) return
    setSalvando(true)
    try {
      const duracaoSegundos = await lerDuracaoVideo(arquivo)
      const id = await createProject({ titulo: titulo.trim(), video: arquivo, duracaoSegundos })
      iniciarProcessamento(id)
      navigate(`/projetos/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o projeto.')
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo projeto</h1>
        <p className="text-sm text-muted-foreground">
          Cole o link do YouTube ou envie um podcast, live ou entrevista. O vídeo fica salvo só no seu navegador.
        </p>
      </div>

      {!hasApiKey ? (
        <ApiKeyAlert />
      ) : !arquivo ? (
        <div className="space-y-6">
          <YoutubeLinkForm onBaixado={criarDoYoutube} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            ou envie um arquivo
            <Separator className="flex-1" />
          </div>
          <VideoDropzone onFile={escolherArquivo} />
        </div>
      ) : (
        <form onSubmit={criar} className="space-y-4">
          <Card>
            <CardContent className="flex items-center gap-3">
              <FileVideo className="size-8 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{arquivo.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(arquivo.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Trocar arquivo"
                disabled={salvando}
                onClick={() => setArquivo(null)}
              >
                <X />
              </Button>
            </CardContent>
          </Card>

          {arquivo.size > LIMITE_AVISO_BYTES && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Arquivo grande (mais de 1 GB)</AlertTitle>
              <AlertDescription>
                O processamento roda no seu navegador e pode ficar lento ou faltar memória. Se der
                problema, tente um vídeo menor ou em resolução mais baixa.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="titulo">Título do projeto</Label>
            <Input
              id="titulo"
              value={titulo}
              maxLength={120}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={salvando || !titulo.trim()}>
            {salvando && <Loader2 className="animate-spin" />}
            {salvando ? 'Salvando vídeo...' : 'Criar projeto'}
          </Button>
        </form>
      )}
    </div>
  )
}

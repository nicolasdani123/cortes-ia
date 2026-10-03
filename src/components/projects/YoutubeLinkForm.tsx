import { Link, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { baixarDoYoutube, isLinkYoutube, type VideoDoYoutube } from '@/lib/youtube'

interface YoutubeLinkFormProps {
  onBaixado: (video: VideoDoYoutube) => Promise<void>
}

export function YoutubeLinkForm({ onBaixado }: YoutubeLinkFormProps) {
  const [link, setLink] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(event: FormEvent) {
    event.preventDefault()
    if (!isLinkYoutube(link)) {
      setErro('Cole um link do YouTube (youtube.com ou youtu.be).')
      return
    }
    setErro(null)
    setProgresso(0)
    setBaixando(true)
    try {
      await onBaixado(await baixarDoYoutube(link, setProgresso))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível baixar o vídeo.')
      setBaixando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            aria-label="Link do vídeo no YouTube"
            className="pl-9"
            value={link}
            disabled={baixando}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={baixando || !link.trim()}>
          {baixando && <Loader2 className="animate-spin" />}
          {baixando ? 'Baixando...' : 'Transcrever'}
        </Button>
      </div>
      {baixando && (
        <div className="space-y-1">
          <Progress value={progresso * 100} />
          <p className="text-xs text-muted-foreground">
            {progresso < 1 ? `Baixando do YouTube... ${Math.round(progresso * 100)}%` : 'Salvando o vídeo...'}
          </p>
        </div>
      )}
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </form>
  )
}

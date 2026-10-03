import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2, MessageSquare, SendHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { db, type Clip, type Mensagem } from '@/db'
import { enviarMensagem } from '@/chat/enviarMensagem'
import { cn } from '@/lib/utils'
import { ClipSugerido } from './ClipSugerido'

const SUGESTOES = [
  'Ache os melhores momentos',
  'Corta o refrão',
  'Os momentos mais engraçados',
  'Sobre o que é esse vídeo?',
]

interface ChatPanelProps {
  projectId: string
  /** O chat só funciona depois da transcrição. */
  habilitado: boolean
  onVerTrecho: (start: number, end: number) => void
}

export function ChatPanel({ projectId, habilitado, onVerTrecho }: ChatPanelProps) {
  const [texto, setTexto] = useState('')
  const listaRef = useRef<HTMLDivElement>(null)

  const mensagens = useLiveQuery(
    () =>
      db.mensagens
        .where('[projectId+createdAt]')
        .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
        .toArray(),
    [projectId],
  )
  const clips = useLiveQuery(() => db.clips.where('projectId').equals(projectId).sortBy('createdAt'), [projectId])

  const clipsPorId = new Map((clips ?? []).map((c, i) => [c.id, { clip: c, numero: i + 1 }]))
  const aguardando = mensagens?.some((m) => m.status === 'PENDENTE') ?? false
  const podeEnviar = habilitado && !aguardando && texto.trim().length > 0

  // Rola a lista (só ela, não a página) até a última mensagem quando chega algo novo.
  const ultima = mensagens?.at(-1)
  useEffect(() => {
    const lista = listaRef.current
    lista?.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' })
  }, [mensagens?.length, ultima?.texto, clips?.length])

  function enviar(mensagem: string) {
    if (!habilitado || aguardando || !mensagem.trim()) return
    setTexto('')
    void enviarMensagem(projectId, mensagem)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    enviar(texto)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      enviar(texto)
    }
  }

  return (
    <div className="flex h-[70svh] min-h-[420px] flex-col rounded-xl border lg:h-[calc(100svh-6rem)]">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <MessageSquare className="size-4 text-primary" />
        <p className="text-sm font-medium">O que você quer cortar?</p>
      </div>

      <div ref={listaRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {mensagens?.length === 0 && (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto size-8 text-primary" />
            <p className="text-sm text-muted-foreground">
              {habilitado
                ? 'Diga qual parte você quer e a IA encontra no vídeo.'
                : 'O chat libera assim que a transcrição terminar.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <Button key={s} size="sm" variant="outline" disabled={!habilitado} onClick={() => enviar(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {mensagens?.map((m) => (
          <Bolha key={m.id} mensagem={m} clipsPorId={clipsPorId} onVerTrecho={onVerTrecho} />
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!habilitado}
          rows={1}
          maxLength={500}
          placeholder={habilitado ? 'Ex.: corta o refrão da música' : 'Aguardando a transcrição...'}
          className="max-h-32 min-h-10 resize-none"
        />
        <Button type="submit" size="icon-lg" disabled={!podeEnviar} aria-label="Enviar">
          {aguardando ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </form>
    </div>
  )
}

interface BolhaProps {
  mensagem: Mensagem
  clipsPorId: Map<string, { clip: Clip; numero: number }>
  onVerTrecho: (start: number, end: number) => void
}

function Bolha({ mensagem, clipsPorId, onVerTrecho }: BolhaProps) {
  if (mensagem.papel === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {mensagem.texto}
        </p>
      </div>
    )
  }

  const clips = mensagem.clipIds.flatMap((id) => {
    const item = clipsPorId.get(id)
    return item ? [item] : []
  })

  return (
    <div className="max-w-[95%] space-y-2">
      <div
        className={cn(
          'rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm whitespace-pre-wrap',
          mensagem.status === 'ERRO' && 'bg-destructive/15 text-destructive',
        )}
      >
        {mensagem.status === 'PENDENTE' ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {mensagem.texto || 'Procurando no vídeo...'}
          </span>
        ) : (
          mensagem.texto
        )}
      </div>
      {clips.map(({ clip, numero }) => (
        <ClipSugerido key={clip.id} clip={clip} numero={numero} onVerTrecho={onVerTrecho} />
      ))}
    </div>
  )
}

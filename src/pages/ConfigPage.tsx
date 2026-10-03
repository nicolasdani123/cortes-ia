import { CheckCircle2, KeyRound, Loader2, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { testApiKey } from '@/lib/groq'
import { CONFIG_PADRAO, maskApiKey, useConfigStore } from '@/stores/config'

const opcoesSchema = z
  .object({
    duracaoMinima: z.number().int().min(5, 'A duração mínima deve ser de pelo menos 5s'),
    duracaoMaxima: z.number().int().max(180, 'A duração máxima deve ser de no máximo 180s'),
    maxCortes: z.number().int().min(1, 'Gere pelo menos 1 corte').max(30, 'No máximo 30 cortes'),
  })
  .refine((o) => o.duracaoMinima < o.duracaoMaxima, {
    message: 'A duração mínima precisa ser menor que a máxima',
  })

type EstadoTeste = 'idle' | 'testando' | 'ok'

function ApiKeyCard() {
  const apiKey = useConfigStore((s) => s.apiKey)
  const setApiKey = useConfigStore((s) => s.setApiKey)
  const [editando, setEditando] = useState(apiKey.length === 0)
  const [valor, setValor] = useState('')
  const [estadoTeste, setEstadoTeste] = useState<EstadoTeste>('idle')

  const chaveParaTestar = editando ? valor.trim() : apiKey

  async function testar() {
    if (!chaveParaTestar) return
    setEstadoTeste('testando')
    try {
      await testApiKey(chaveParaTestar)
      setEstadoTeste('ok')
      toast.success('Chave válida!')
    } catch (error) {
      setEstadoTeste('idle')
      toast.error(error instanceof Error ? error.message : 'Não foi possível testar a chave.')
    }
  }

  function salvar(event: FormEvent) {
    event.preventDefault()
    if (!valor.trim()) return
    setApiKey(valor)
    setValor('')
    setEditando(false)
    toast.success('Chave salva.')
  }

  function remover() {
    setApiKey('')
    setEditando(true)
    setEstadoTeste('idle')
    toast('Chave removida.')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Chave do Groq
        </CardTitle>
        <CardDescription>
          Usada para transcrever (Whisper) e escolher os cortes. Fica salva só neste navegador.
          Crie a sua em{' '}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            console.groq.com/keys
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {editando ? (
          <form onSubmit={salvar} className="space-y-3">
            <Label htmlFor="api-key">Chave</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              placeholder="gsk_..."
              value={valor}
              onChange={(e) => {
                setValor(e.target.value)
                setEstadoTeste('idle')
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!valor.trim()}>
                Salvar
              </Button>
              <TestarButton estado={estadoTeste} disabled={!valor.trim()} onClick={testar} />
              {apiKey && (
                <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
              {maskApiKey(apiKey)}
            </div>
            <div className="flex flex-wrap gap-2">
              <TestarButton estado={estadoTeste} onClick={testar} />
              <Button variant="outline" onClick={() => setEditando(true)}>
                Trocar chave
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={remover}>
                <Trash2 /> Remover
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface TestarButtonProps {
  estado: EstadoTeste
  disabled?: boolean
  onClick: () => void
}

function TestarButton({ estado, disabled, onClick }: TestarButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled || estado === 'testando'}
      onClick={onClick}
    >
      {estado === 'testando' && <Loader2 className="animate-spin" />}
      {estado === 'ok' && <CheckCircle2 className="text-green-500" />}
      Testar chave
    </Button>
  )
}

function OpcoesCard() {
  const duracaoMinima = useConfigStore((s) => s.duracaoMinima)
  const duracaoMaxima = useConfigStore((s) => s.duracaoMaxima)
  const maxCortes = useConfigStore((s) => s.maxCortes)
  const setOpcoes = useConfigStore((s) => s.setOpcoes)

  const [form, setForm] = useState({
    duracaoMinima: String(duracaoMinima),
    duracaoMaxima: String(duracaoMaxima),
    maxCortes: String(maxCortes),
  })

  function salvar(event: FormEvent) {
    event.preventDefault()
    const resultado = opcoesSchema.safeParse({
      duracaoMinima: Number(form.duracaoMinima),
      duracaoMaxima: Number(form.duracaoMaxima),
      maxCortes: Number(form.maxCortes),
    })
    if (!resultado.success) {
      toast.error(resultado.error.issues[0]?.message ?? 'Valores inválidos.')
      return
    }
    setOpcoes(resultado.data)
    toast.success('Opções salvas.')
  }

  function restaurarPadrao() {
    const { duracaoMinima, duracaoMaxima, maxCortes } = CONFIG_PADRAO
    setOpcoes({ duracaoMinima, duracaoMaxima, maxCortes })
    setForm({
      duracaoMinima: String(duracaoMinima),
      duracaoMaxima: String(duracaoMaxima),
      maxCortes: String(maxCortes),
    })
    toast('Opções restauradas para o padrão.')
  }

  const campos = [
    { id: 'duracaoMinima', label: 'Duração mínima (s)' },
    { id: 'duracaoMaxima', label: 'Duração máxima (s)' },
    { id: 'maxCortes', label: 'Máximo de cortes' },
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opções dos cortes</CardTitle>
        <CardDescription>Valem para os próximos projetos que você criar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {campos.map(({ id, label }) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={form[id]}
                  onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Salvar opções</Button>
            <Button type="button" variant="ghost" onClick={restaurarPadrao}>
              Restaurar padrão
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ConfigPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Chave da API e preferências dos cortes.</p>
      </div>
      <ApiKeyCard />
      <OpcoesCard />
    </div>
  )
}

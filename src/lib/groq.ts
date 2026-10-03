import { z } from 'zod'

// A API do Groq segue o formato da OpenAI e libera CORS, então dá para chamar direto do navegador.
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

export const GROQ_MODELOS = {
  /** Transcrição com timestamps por palavra. A v3 completa erra menos em português que a turbo. */
  transcricao: 'whisper-large-v3',
  /** Seleção dos cortes. */
  llm: 'openai/gpt-oss-120b',
} as const

/** Limite de upload do Whisper no plano gratuito do Groq é 25 MB; ficamos um pouco abaixo. */
export const LIMITE_AUDIO_BYTES = 24 * 1024 * 1024

export class GroqError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GroqError'
    this.status = status
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'object' &&
      body.error !== null &&
      'message' in body.error &&
      typeof body.error.message === 'string'
    ) {
      return body.error.message
    }
  } catch {
    // Corpo não é JSON; usa a mensagem genérica abaixo.
  }
  return `Erro ${response.status} na API do Groq`
}

/** Faz uma chamada leve (listar modelos) só para validar a chave. */
export async function testApiKey(apiKey: string): Promise<void> {
  await groqFetch(apiKey, '/models', {})
}

const ESPERA_MAXIMA_RETRY_S = 60
const TENTATIVAS_429 = 3

/** "7m12.5s", "30s" ou "12" (formatos usados pelo Groq no retry-after/x-ratelimit) → segundos. */
function parseEspera(valor: string | null): number | null {
  if (!valor) return null
  if (/^\d+(\.\d+)?$/.test(valor)) return Number(valor)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(valor)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

function formatEspera(segundos: number): string {
  return segundos < 90 ? `${Math.ceil(segundos)} s` : `${Math.ceil(segundos / 60)} min`
}

/** O Groq não manda o header retry-after; a espera real vem só na mensagem ("Please try again in 15.38s"). */
function parseEsperaDaMensagem(mensagem: string): number | null {
  const m = /try again in ([\d.]+)\s*s/i.exec(mensagem)
  return m?.[1] ? Number(m[1]) : null
}

/**
 * fetch autenticado na API do Groq. Em 429 (limite de uso), espera e tenta de novo se a espera
 * pedida for curta; se for longa (limite por hora/dia do plano gratuito), falha com mensagem clara.
 */
async function groqFetch(apiKey: string, caminho: string, init: RequestInit): Promise<Response> {
  for (let tentativa = 1; ; tentativa++) {
    let response: Response
    try {
      response = await fetch(`${GROQ_BASE_URL}${caminho}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
      })
    } catch (error) {
      // O fetch só rejeita (TypeError "Failed to fetch") quando a requisição nem chega ao servidor.
      throw new Error('Sem conexão com o Groq. Confira sua internet e clique em "Tentar de novo".', { cause: error })
    }
    if (response.ok) return response

    if (response.status === 429) {
      const mensagem = await readErrorMessage(response.clone())
      // Alguma margem (+1s) porque o TPM reseta numa janela deslizante; esperar exatamente o pedido às vezes ainda cai no limite.
      const espera = (parseEspera(response.headers.get('retry-after')) ?? parseEsperaDaMensagem(mensagem) ?? 5) + 1
      if (espera <= ESPERA_MAXIMA_RETRY_S && tentativa < TENTATIVAS_429) {
        await new Promise((resolve) => setTimeout(resolve, espera * 1000))
        continue
      }
      throw new GroqError(`Limite de uso do Groq atingido. Tente de novo em ${formatEspera(espera)}. (${mensagem})`, 429)
    }
    if (response.status === 401) throw new GroqError('Chave do Groq inválida ou revogada.', 401)
    throw new GroqError(await readErrorMessage(response), response.status)
  }
}

const whisperRespostaSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
        no_speech_prob: z.number().optional(),
        avg_logprob: z.number().optional(),
      }),
    )
    .default([]),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).default([]),
})

export type WhisperResposta = z.infer<typeof whisperRespostaSchema>

/**
 * Transcreve um arquivo de áudio com timestamps por segmento e por palavra.
 * O idioma é fixo em português: os vídeos são sempre em PT-BR, e a detecção automática
 * às vezes erra (ex.: começo com música ou termos em inglês) e transcreve/traduz em outro idioma.
 */
export async function transcreverAudio(apiKey: string, audio: Blob): Promise<WhisperResposta> {
  const form = new FormData()
  form.append('file', audio, 'audio.mp3')
  form.append('model', GROQ_MODELOS.transcricao)
  form.append('language', 'pt')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  form.append('temperature', '0')

  const response = await groqFetch(apiKey, '/audio/transcriptions', { method: 'POST', body: form })
  const resultado = whisperRespostaSchema.safeParse(await response.json())
  if (!resultado.success) {
    throw new Error(`Resposta inesperada da transcrição: ${resultado.error.issues[0]?.message ?? 'formato inválido'}`)
  }
  return resultado.data
}

export interface MensagemLLM {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SchemaJson {
  nome: string
  /** JSON Schema no formato "strict": todos os campos obrigatórios e additionalProperties: false. */
  schema: Record<string, unknown>
}

const chatRespostaSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
})

/**
 * Chat com saída estruturada: o modelo é obrigado a seguir o schema (strict mode).
 * Devolve o JSON já parseado; a validação de negócio (Zod) fica com quem chama.
 */
export async function chatJson(
  apiKey: string,
  mensagens: MensagemLLM[],
  { nome, schema }: SchemaJson,
  maxTokensSaida: number,
): Promise<unknown> {
  const response = await groqFetch(apiKey, '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODELOS.llm,
      messages: mensagens,
      temperature: 0.3,
      // Pouco raciocínio basta para localizar trechos e economiza tokens do limite por minuto.
      reasoning_effort: 'low',
      max_completion_tokens: maxTokensSaida,
      response_format: { type: 'json_schema', json_schema: { name: nome, strict: true, schema } },
    }),
  })

  const corpo = chatRespostaSchema.safeParse(await response.json())
  if (!corpo.success) throw new Error('Resposta inesperada da IA.')
  const escolha = corpo.data.choices[0]
  if (escolha?.finish_reason === 'length') throw new Error('A resposta da IA ficou longa demais e foi cortada. Tente um pedido mais específico.')
  const conteudo = escolha?.message.content
  if (!conteudo) throw new Error('A IA devolveu uma resposta vazia.')

  try {
    return JSON.parse(conteudo) as unknown
  } catch {
    throw new Error('A IA devolveu um JSON inválido.')
  }
}

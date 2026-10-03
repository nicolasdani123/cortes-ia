import { z } from 'zod'
import { db, type Clip, type Mensagem } from '@/db'
import { formatDuracao } from '@/lib/format'
import { chatJson, type MensagemLLM } from '@/lib/groq'
import { montarPromptSistema, SCHEMA_RESPOSTA } from '@/prompts/select-clips'
import { renderizarCortes } from '@/pipeline/renderizarCorte'
import { useConfigStore } from '@/stores/config'
import { ajustarCortes, type CorteBruto } from './ajustarCortes'
import { dividirEmBlocos, formatarFrases, segmentosEmFrases } from './transcricao'

/**
 * Orçamento pensado no plano gratuito do Groq (8.000 tokens/min no gpt-oss-120b):
 * prompt (~1.200) + histórico (~500) + transcrição (3.500) + saída (2.500) ≈ 7.700.
 * Com plano pago dá para aumentar TOKENS_TRANSCRICAO e mandar o vídeo inteiro de uma vez.
 */
const TOKENS_TRANSCRICAO = 3500
const TOKENS_SAIDA = 2500
const SOBREPOSICAO_S = 60
const MENSAGENS_HISTORICO = 6

const respostaIASchema = z.object({
  resposta: z.string(),
  cortes: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      titulo: z.string(),
      gancho: z.string(),
      motivo: z.string(),
      categoria: z.string(),
      score: z.number(),
    }),
  ),
})

/** Clips do projeto na ordem em que foram criados; a posição +1 é o número mostrado na tela (#1, #2...). */
export async function listarClipsNumerados(projectId: string): Promise<Clip[]> {
  return db.clips.where('projectId').equals(projectId).sortBy('createdAt')
}

async function montarHistorico(projectId: string, antesDe: Date): Promise<MensagemLLM[]> {
  const anteriores = await db.mensagens
    .where('[projectId+createdAt]')
    .between([projectId, new Date(0)], [projectId, antesDe], true, false)
    .filter((m) => m.status === 'OK')
    .toArray()
  const clips = await listarClipsNumerados(projectId)
  const numero = new Map(clips.map((c, i) => [c.id, i + 1]))
  const porId = new Map(clips.map((c) => [c.id, c]))

  return anteriores.slice(-MENSAGENS_HISTORICO).map((m) => {
    if (m.papel === 'user') return { role: 'user', content: m.texto }
    const lista = m.clipIds
      .map((id) => porId.get(id))
      .filter((c): c is Clip => c !== undefined)
      .map((c) => `#${numero.get(c.id)} [${c.start.toFixed(1)}-${c.end.toFixed(1)}] ${c.titulo}`)
    const content = lista.length ? `${m.texto}\nCortes criados: ${lista.join('; ')}` : m.texto
    return { role: 'assistant', content }
  })
}

/** Grava a mensagem do usuário, pede os cortes à IA e grava a resposta (com os clips em PENDING). */
export async function enviarMensagem(projectId: string, texto: string): Promise<void> {
  const { apiKey, duracaoMinima, duracaoMaxima, maxCortes } = useConfigStore.getState()
  const agora = Date.now()
  const pergunta: Mensagem = {
    id: crypto.randomUUID(),
    projectId,
    papel: 'user',
    texto: texto.trim(),
    status: 'OK',
    clipIds: [],
    createdAt: new Date(agora),
  }
  const resposta: Mensagem = {
    id: crypto.randomUUID(),
    projectId,
    papel: 'assistant',
    texto: '',
    status: 'PENDENTE',
    clipIds: [],
    createdAt: new Date(agora + 1),
  }

  const historico = await montarHistorico(projectId, pergunta.createdAt)
  await db.mensagens.bulkAdd([pergunta, resposta])

  try {
    if (!apiKey) throw new Error('Configure a chave do Groq em Configurações.')
    const [project, transcript] = await Promise.all([
      db.projects.get(projectId),
      db.transcripts.where('projectId').equals(projectId).first(),
    ])
    if (!project || !transcript) throw new Error('A transcrição deste projeto não foi encontrada.')

    const blocos = dividirEmBlocos(segmentosEmFrases(transcript.segmentos), TOKENS_TRANSCRICAO, SOBREPOSICAO_S)
    const candidatos: CorteBruto[] = []
    const respostasComCorte: { texto: string; melhorScore: number }[] = []
    let respostaUnica = ''

    for (const [i, bloco] of blocos.entries()) {
      if (blocos.length > 1) {
        await db.mensagens.update(resposta.id, { texto: `Analisando parte ${i + 1} de ${blocos.length} do vídeo...` })
      }
      const sistema = montarPromptSistema({
        duracaoVideo: project.duracaoSegundos,
        duracaoMinima,
        duracaoMaxima,
        maxCortes,
        bloco: blocos.length > 1 ? { indice: i + 1, total: blocos.length, inicio: bloco.inicio, fim: bloco.fim } : null,
      })
      const bruto = await chatJson(
        apiKey,
        [
          { role: 'system', content: `${sistema}\n\nTRANSCRIÇÃO\n${formatarFrases(bloco.frases)}` },
          ...historico,
          { role: 'user', content: pergunta.texto },
        ],
        SCHEMA_RESPOSTA,
        TOKENS_SAIDA,
      )
      const validado = respostaIASchema.safeParse(bruto)
      if (!validado.success) throw new Error('A IA respondeu fora do formato esperado. Tente de novo.')

      candidatos.push(...validado.data.cortes)
      respostaUnica = validado.data.resposta
      if (validado.data.cortes.length > 0) {
        respostasComCorte.push({
          texto: validado.data.resposta,
          melhorScore: Math.max(...validado.data.cortes.map((c) => c.score)),
        })
      }
    }

    const palavras = transcript.segmentos.flatMap((s) => s.palavras)
    const cortes = ajustarCortes(candidatos, { palavras, duracaoVideo: project.duracaoSegundos, maxCortes })

    let textoFinal: string
    if (blocos.length === 1) {
      textoFinal = respostaUnica
      if (candidatos.length > 0 && cortes.length === 0) {
        textoFinal += '\n\n(Os trechos sugeridos eram inválidos, curtos ou longos demais e foram descartados.)'
      }
    } else if (cortes.length === 0) {
      textoFinal = 'Não encontrei esse trecho no vídeo. Tente descrever de outro jeito.'
    } else {
      // Em vídeos longos cada bloco responde separado; usa o texto do bloco com o melhor corte.
      const melhor = [...respostasComCorte].sort((a, b) => b.melhorScore - a.melhorScore)[0]
      const resumo = cortes.map((c) => `${formatDuracao(c.start)}–${formatDuracao(c.end)}`).join(', ')
      textoFinal = `${melhor?.texto ?? ''}\n\nCortes: ${resumo}.`.trim()
    }

    const criadoEm = Date.now()
    const clips: Clip[] = cortes.map((c, i) => ({
      id: crypto.randomUUID(),
      projectId,
      start: c.start,
      end: c.end,
      titulo: c.titulo,
      gancho: c.gancho,
      motivo: c.motivo,
      categoria: c.categoria,
      score: c.score,
      status: 'PENDING',
      outputBlob: null,
      createdAt: new Date(criadoEm + i),
    }))

    await db.transaction('rw', db.clips, db.mensagens, async () => {
      await db.clips.bulkAdd(clips)
      await db.mensagens.update(resposta.id, {
        texto: textoFinal,
        status: 'OK',
        clipIds: clips.map((c) => c.id),
      })
    })
    // Sem await: a resposta já aparece e os cortes são gerados (e baixados) em segundo plano.
    void renderizarCortes(clips.map((c) => c.id))
  } catch (error) {
    await db.mensagens.update(resposta.id, {
      texto: error instanceof Error ? error.message : 'Algo deu errado ao falar com a IA.',
      status: 'ERRO',
    })
  }
}

/** Ao abrir o app, respostas que ficaram pela metade (aba fechada) viram erro. */
export async function marcarMensagensInterrompidas(): Promise<void> {
  await db.mensagens
    .where('status')
    .equals('PENDENTE')
    .modify({ status: 'ERRO', texto: 'A resposta foi interrompida porque a aba foi fechada ou recarregada.' })
}

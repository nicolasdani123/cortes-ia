// Baixa vídeos do YouTube com o yt-dlp. Roda dentro do servidor de dev do Vite (local) ou sozinho
// pelo server/standalone.ts (Render). O navegador não consegue baixar do YouTube sozinho (CORS e
// proteções da plataforma), então o app pede aqui, acompanha o progresso e depois busca o .mp4 pronto.
//
//   POST /api/youtube/jobs          { url }  → { id }
//   GET  /api/youtube/jobs/:id               → { status, progresso, titulo, duracaoSegundos, erro }
//   GET  /api/youtube/jobs/:id/arquivo       → o .mp4 (apaga os temporários depois de enviar)
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const PASTA_BIN = join(import.meta.dirname, '..', 'node_modules', '.yt-dlp')
/** No Docker do Render o yt-dlp já vem instalado na imagem (YTDLP_PATH). */
const EXECUTAVEL = process.env.YTDLP_PATH || join(PASTA_BIN, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
// No Linux, o "yt-dlp_linux" é o binário independente; o "yt-dlp" puro precisa de Python instalado.
const URL_DOWNLOAD_YTDLP = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${
  process.platform === 'win32' ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux'
}`
const PASTA_TEMP = join(tmpdir(), 'site-cortes-ia-youtube')

/**
 * Em servidores na nuvem o YouTube costuma pedir login ("not a bot"). Dá para contornar com um
 * cookies.txt de uma conta (Secret File no Render) e/ou um proxy residencial.
 */
const ARQUIVO_COOKIES = process.env.YTDLP_COOKIES
const PROXY = process.env.YTDLP_PROXY

/** Cada download ocupa CPU, disco e banda; no plano grátis do Render cabe pouco. */
const MAX_DOWNLOADS_SIMULTANEOS = Number(process.env.MAX_DOWNLOADS_SIMULTANEOS) || 2

/** Até 720p em H.264 + AAC: abre em qualquer navegador e não pesa demais no ffmpeg.wasm. */
const FORMATO = 'bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b'

/** Jobs não buscados somem depois disso, para não acumular vídeos no disco. */
const VALIDADE_JOB_MS = 60 * 60 * 1000

type StatusJob = 'BAIXANDO' | 'PRONTO' | 'ERRO'

interface Job {
  id: string
  status: StatusJob
  /** 0 a 100. */
  progresso: number
  titulo: string | null
  duracaoSegundos: number | null
  erro: string | null
  /** Fim da saída do yt-dlp quando falha, para diagnosticar sem acesso aos logs do servidor. */
  detalhe: string | null
  pasta: string
  arquivo: string | null
}

const jobs = new Map<string, Job>()

let instalando: Promise<void> | null = null

/** Baixa o executável do yt-dlp na primeira vez que for usado. */
function garantirYtDlp(): Promise<void> {
  if (existsSync(EXECUTAVEL)) return Promise.resolve()
  instalando ??= (async () => {
    console.log('[youtube] baixando o yt-dlp...')
    const resposta = await fetch(URL_DOWNLOAD_YTDLP)
    if (!resposta.ok) throw new Error(`Não foi possível baixar o yt-dlp (HTTP ${resposta.status}).`)
    await mkdir(PASTA_BIN, { recursive: true })
    await writeFile(EXECUTAVEL, Buffer.from(await resposta.arrayBuffer()))
    await chmod(EXECUTAVEL, 0o755)
    console.log('[youtube] yt-dlp instalado em', EXECUTAVEL)
  })().finally(() => {
    instalando = null
  })
  return instalando
}

function isLinkYoutube(texto: string): boolean {
  try {
    const { hostname } = new URL(texto)
    return /(^|\.)(youtube\.com|youtu\.be)$/.test(hostname)
  } catch {
    return false
  }
}

/**
 * O YouTube recusou até os dados do vídeo (não só o arquivo): é o IP do servidor que está bloqueado,
 * comum em servidores na nuvem. Tentar de novo não adianta.
 */
function servidorBloqueado(saida: string): boolean {
  return /Failed to extract any player response/i.test(saida)
}

/** Traduz os erros mais comuns do yt-dlp para algo que dá para agir. */
function mensagemDeErro(saida: string): string {
  if (servidorBloqueado(saida)) {
    return 'O YouTube está bloqueando o servidor de download. Por enquanto, baixe o vídeo e envie o arquivo.'
  }
  if (/ffmpeg/i.test(saida) && /not (found|installed)/i.test(saida)) {
    return 'O ffmpeg não foi encontrado no PC. Instale com "winget install Gyan.FFmpeg" e reinicie o npm run dev.'
  }
  if (/private video/i.test(saida)) return 'Esse vídeo é privado.'
  if (/sign in to confirm your age/i.test(saida)) return 'Esse vídeo tem restrição de idade e não pode ser baixado.'
  if (/not a bot/i.test(saida)) return 'O YouTube bloqueou o download temporariamente. Tente de novo em alguns minutos.'
  if (/video unavailable/i.test(saida)) return 'Vídeo indisponível. Confira o link.'
  if (/live event|is live/i.test(saida)) return 'Lives em andamento não podem ser baixadas. Espere a live terminar.'
  if (/HTTP Error 403/i.test(saida)) {
    return 'O YouTube recusou o download (erro 403). Tente de novo em alguns minutos ou com outro vídeo.'
  }
  const ultimoErro = saida.split('\n').reverse().find((linha) => linha.includes('ERROR:'))
  return ultimoErro?.replace(/^.*ERROR:\s*/, '') || 'O download falhou. Tente de novo.'
}

/** O YouTube às vezes recusa (403) os links de vídeo que acabou de gerar; extrair de novo costuma resolver. */
const TENTATIVAS = 3

class ErroYtDlp extends Error {
  readonly saida: string
  constructor(saida: string) {
    super(mensagemDeErro(saida))
    this.saida = saida
  }
}

/** Atualiza o yt-dlp (o YouTube muda e versões antigas passam a levar 403). Falhar aqui não é grave. */
function atualizarYtDlp(): Promise<void> {
  return new Promise((resolve) => {
    const processo = spawn(EXECUTAVEL, ['-U'])
    processo.on('error', () => resolve())
    processo.on('close', () => resolve())
  })
}

async function baixar(job: Job, url: string): Promise<void> {
  await garantirYtDlp()

  for (let tentativa = 1; ; tentativa++) {
    // Começa do zero: sobras de uma tentativa anterior apontam para links que o YouTube já recusou.
    await rm(job.pasta, { recursive: true, force: true })
    await mkdir(job.pasta, { recursive: true })
    job.progresso = 0
    try {
      await rodarYtDlp(job, url)
      break
    } catch (error) {
      const repetir =
        error instanceof ErroYtDlp && /HTTP Error 403/i.test(error.saida) && !servidorBloqueado(error.saida)
      if (!repetir || tentativa >= TENTATIVAS) throw error
      console.warn(`[youtube] 403 do YouTube, tentando de novo (${tentativa + 1}/${TENTATIVAS})`)
      if (tentativa === 1) await atualizarYtDlp()
    }
  }
  await lerResultado(job)
}

/** O yt-dlp regrava o arquivo de cookies, e o Secret File do Render é só leitura: usa uma cópia. */
async function argumentosDeAcesso(job: Job): Promise<string[]> {
  const args: string[] = []
  if (PROXY) args.push('--proxy', PROXY)
  if (ARQUIVO_COOKIES && existsSync(ARQUIVO_COOKIES)) {
    const copia = join(job.pasta, 'cookies.txt')
    await copyFile(ARQUIVO_COOKIES, copia)
    args.push('--cookies', copia)
  }
  return args
}

async function rodarYtDlp(job: Job, url: string): Promise<void> {
  const acesso = await argumentosDeAcesso(job)
  return new Promise<void>((resolve, reject) => {
    const processo = spawn(EXECUTAVEL, [
      ...acesso,
      '--no-playlist',
      '--format', FORMATO,
      '--merge-output-format', 'mp4',
      '--write-info-json',
      '--js-runtimes', 'node',
      '--newline',
      '--progress-template', 'download:PROGRESSO %(progress._percent_str)s',
      '--output', join(job.pasta, 'video.%(ext)s'),
      url,
    ])

    let saida = ''
    // Vídeo e áudio vêm em arquivos separados: o vídeo vale 0–90% e o áudio 90–100%.
    let arquivoAtual = -1
    const lerLinhas = (dados: Buffer) => {
      const texto = dados.toString()
      saida = (saida + texto).slice(-8000)
      for (const linha of texto.split(/\r?\n/)) {
        if (linha.startsWith('[download] Destination:')) arquivoAtual++
        const m = /^PROGRESSO\s+([\d.]+)%/.exec(linha.trim())
        if (!m) continue
        const pct = Number(m[1])
        job.progresso = Math.min(99, Math.round(arquivoAtual <= 0 ? pct * 0.9 : 90 + pct * 0.1))
      }
    }
    processo.stdout.on('data', lerLinhas)
    processo.stderr.on('data', lerLinhas)
    processo.on('error', reject)
    processo.on('close', (codigo) => (codigo === 0 ? resolve() : reject(new ErroYtDlp(saida))))
  })
}

async function lerResultado(job: Job): Promise<void> {
  const arquivos = await readdir(job.pasta)
  const video = arquivos.find((nome) => /^video\.(mp4|webm|mkv|mov)$/.test(nome))
  if (!video) throw new Error('O yt-dlp terminou, mas o arquivo de vídeo não apareceu.')
  const infoJson = arquivos.find((nome) => nome.endsWith('.info.json'))
  if (infoJson) {
    const info: unknown = JSON.parse(await readFile(join(job.pasta, infoJson), 'utf8'))
    if (typeof info === 'object' && info !== null) {
      if ('title' in info && typeof info.title === 'string') job.titulo = info.title
      if ('duration' in info && typeof info.duration === 'number') job.duracaoSegundos = info.duration
    }
  }
  job.arquivo = join(job.pasta, video)
  job.progresso = 100
  job.status = 'PRONTO'
}

function apagarJob(job: Job): void {
  jobs.delete(job.id)
  void rm(job.pasta, { recursive: true, force: true })
}

function criarJob(url: string): Job {
  const id = randomUUID()
  const job: Job = {
    id,
    status: 'BAIXANDO',
    progresso: 0,
    titulo: null,
    duracaoSegundos: null,
    erro: null,
    detalhe: null,
    pasta: join(PASTA_TEMP, id),
    arquivo: null,
  }
  jobs.set(id, job)
  baixar(job, url).catch((error: unknown) => {
    console.error('[youtube] download falhou', error)
    job.status = 'ERRO'
    job.erro = error instanceof Error ? error.message : String(error)
    if (error instanceof ErroYtDlp) {
      console.error(error.saida)
      job.detalhe = error.saida.slice(-3000)
    }
  })
  setTimeout(() => apagarJob(job), VALIDADE_JOB_MS).unref()
  return job
}

function responderJson(res: ServerResponse, status: number, corpo: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(corpo))
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  let texto = ''
  for await (const parte of req) texto += String(parte)
  return JSON.parse(texto || '{}')
}

async function rotear(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caminho = new URL(req.url ?? '/', 'http://localhost').pathname

  if (req.method === 'POST' && caminho === '/api/youtube/jobs') {
    const corpo = await lerCorpo(req)
    const url = typeof corpo === 'object' && corpo !== null && 'url' in corpo ? corpo.url : null
    if (typeof url !== 'string' || !isLinkYoutube(url)) {
      return responderJson(res, 400, { erro: 'Cole um link do YouTube válido.' })
    }
    const emAndamento = [...jobs.values()].filter((job) => job.status === 'BAIXANDO').length
    if (emAndamento >= MAX_DOWNLOADS_SIMULTANEOS) {
      return responderJson(res, 429, { erro: 'Já tem vídeo baixando no servidor. Espere terminar e tente de novo.' })
    }
    return responderJson(res, 201, { id: criarJob(url).id })
  }

  const m = /^\/api\/youtube\/jobs\/([\w-]+)(\/arquivo)?$/.exec(caminho)
  const job = m?.[1] ? jobs.get(m[1]) : undefined
  if (req.method !== 'GET' || !m) return responderJson(res, 404, { erro: 'Rota não encontrada.' })
  if (!job) return responderJson(res, 404, { erro: 'Download não encontrado. Tente de novo.' })

  if (!m[2]) {
    const { status, progresso, titulo, duracaoSegundos, erro, detalhe } = job
    return responderJson(res, 200, { status, progresso, titulo, duracaoSegundos, erro, detalhe })
  }

  if (job.status !== 'PRONTO' || !job.arquivo) {
    return responderJson(res, 409, { erro: 'O vídeo ainda não terminou de baixar.' })
  }
  const { size } = await stat(job.arquivo)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', size)
  const leitura = createReadStream(job.arquivo)
  leitura.pipe(res)
  // Espera também o arquivo fechar: no Windows não dá para apagar arquivo aberto.
  const fechou = new Promise<void>((resolve) => leitura.on('close', () => resolve()))
  const enviou = new Promise<boolean>((resolve) => res.on('close', () => resolve(res.writableFinished)))
  void Promise.all([enviou, fechou]).then(([completo]) => {
    if (completo) apagarJob(job)
  })
}

/** Atende /api/youtube/*; o resto segue para `next`. */
export function middlewareYoutube(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (!req.url?.startsWith('/api/youtube/')) return next()
  rotear(req, res).catch((error: unknown) => {
    console.error('[youtube]', error)
    if (!res.headersSent) responderJson(res, 500, { erro: 'Erro inesperado no servidor de download.' })
  })
}

/** Expõe a API acima em /api/youtube no `npm run dev` e no `npm run preview`. */
export function youtubePlugin(): Plugin {
  return {
    name: 'youtube-download',
    configureServer: (server) => void server.middlewares.use(middlewareYoutube),
    configurePreviewServer: (server) => void server.middlewares.use(middlewareYoutube),
  }
}

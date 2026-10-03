import { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

// Servidos de public/ffmpeg (ver scripts/copy-ffmpeg.mjs): precisam chegar sem transformação do Vite.
const CORE_MT = '/ffmpeg/mt'
const CORE_ST = '/ffmpeg/st'

/**
 * O @ffmpeg/ffmpeg executa o ffmpeg dentro de um Web Worker próprio; a interface nunca trava.
 * Este módulo mantém uma única instância carregada e expõe helpers com progresso.
 */

let instancia: FFmpeg | null = null
let carregando: Promise<FFmpeg> | null = null

/**
 * Sempre passar ['-threads', THREADS_X264] ao codificar com libx264: sozinho, o x264 escolhe
 * 6+ threads, esgota o pool de threads do core multithread e o exec trava sem erro.
 */
export const THREADS_X264 = '4'

/** Com COOP/COEP ativos (crossOriginIsolated) usamos a versão multithread, bem mais rápida. */
export const usaMultithread = () => globalThis.crossOriginIsolated === true

async function carregar(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg()
  // Blob URLs evitam problemas de caminho do worker interno do core entre dev e build.
  if (usaMultithread()) {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_MT}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_MT}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${CORE_MT}/ffmpeg-core.worker.js`, 'text/javascript'),
    })
  } else {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_ST}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_ST}/ffmpeg-core.wasm`, 'application/wasm'),
    })
  }
  return ffmpeg
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (instancia) return instancia
  carregando ??= carregar()
    .then((ffmpeg) => {
      instancia = ffmpeg
      return ffmpeg
    })
    .finally(() => {
      carregando = null
    })
  return carregando
}

let fila: Promise<unknown> = Promise.resolve()

/**
 * Roda `tarefa` com o ffmpeg só para ela. Processamento de projetos e renderização de cortes
 * compartilham a mesma instância; sem isto, arquivos e logs de um se misturariam com os do outro.
 */
export function exclusivo<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(tarefa)
  fila = resultado.catch(() => undefined)
  return resultado
}

/** Mata o worker (cancela o que estiver rodando). A próxima chamada carrega de novo. */
export function terminateFFmpeg(): void {
  instancia?.terminate()
  instancia = null
}

/** "01:02:03.45" → 3723.45 */
function parseTempo(texto: string): number {
  const [h, m, s] = texto.split(':').map(Number)
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)
}

export interface ExecOptions {
  /**
   * Duração esperada da saída, em segundos, para calcular o progresso.
   * Se omitida, usa a duração do arquivo de entrada informada pelo próprio ffmpeg.
   */
  duracaoSaida?: number
  onProgress?: (fracao: number) => void
}

export interface ExecResultado {
  /** Duração do primeiro arquivo de entrada, lida do log ("Duration: ..."). */
  duracaoEntrada: number | null
}

/**
 * Executa um comando e lê o progresso do log ("time=...").
 * O evento "progress" do ffmpeg.wasm é impreciso com -ss/-t, por isso não é usado.
 */
export async function execFFmpeg(args: string[], opcoes: ExecOptions = {}): Promise<ExecResultado> {
  const ffmpeg = await getFFmpeg()
  const ultimasLinhas: string[] = []
  let duracaoEntrada: number | null = null

  const onLog = ({ message }: { message: string }) => {
    ultimasLinhas.push(message)
    if (ultimasLinhas.length > 30) ultimasLinhas.shift()

    const duracao = /Duration: (\d+:\d+:\d+(?:\.\d+)?)/.exec(message)
    if (duracao?.[1] && duracaoEntrada === null) duracaoEntrada = parseTempo(duracao[1])

    const tempo = /time=\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(message)
    const total = opcoes.duracaoSaida ?? duracaoEntrada
    if (tempo?.[1] && total && opcoes.onProgress) {
      opcoes.onProgress(Math.min(1, parseTempo(tempo[1]) / total))
    }
  }

  ffmpeg.on('log', onLog)
  try {
    const codigo = await ffmpeg.exec(args)
    if (codigo !== 0) {
      const detalhe = ultimasLinhas.filter((l) => !l.startsWith('  ')).slice(-3).join(' | ')
      throw new Error(`O ffmpeg falhou (código ${codigo}). ${detalhe}`)
    }
    opcoes.onProgress?.(1)
    return { duracaoEntrada }
  } finally {
    ffmpeg.off('log', onLog)
  }
}

/**
 * Deixa o Blob acessível no sistema de arquivos do ffmpeg sem copiá-lo para a memória
 * (WORKERFS lê direto do Blob). Essencial para vídeos grandes.
 */
export async function montarBlob(blob: Blob, nome: string): Promise<{ caminho: string; desmontar: () => Promise<void> }> {
  const ffmpeg = await getFFmpeg()
  const pasta = `/in-${crypto.randomUUID()}`
  await ffmpeg.createDir(pasta)
  await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: nome, data: blob }] }, pasta)
  return {
    caminho: `${pasta}/${nome}`,
    desmontar: async () => {
      await ffmpeg.unmount(pasta).catch(() => undefined)
      await ffmpeg.deleteDir(pasta).catch(() => undefined)
    },
  }
}

export async function lerArquivo(caminho: string, tipo: string): Promise<Blob> {
  const ffmpeg = await getFFmpeg()
  const dados = await ffmpeg.readFile(caminho)
  if (typeof dados === 'string') throw new Error(`Leitura inesperada em texto: ${caminho}`)
  // slice() gera uma cópia com ArrayBuffer próprio (a original pode ser compartilhada no modo multithread).
  return new Blob([dados.slice()], { type: tipo })
}

/** Apaga arquivos temporários, ignorando os que já não existem. */
export async function apagarArquivos(...caminhos: string[]): Promise<void> {
  const ffmpeg = await getFFmpeg()
  await Promise.all(caminhos.map((c) => ffmpeg.deleteFile(c).catch(() => undefined)))
}

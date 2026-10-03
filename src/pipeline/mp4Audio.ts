/**
 * Extrai a trilha de áudio AAC de um mp4 lendo só as partes necessárias do Blob.
 *
 * Existe porque o ffmpeg.wasm é de 32 bits: não abre arquivos a partir de 2 GiB (o "moov" costuma
 * ficar no fim do arquivo e o ffmpeg não consegue chegar nele). Aqui o Blob é lido por fatias
 * (Blob.slice aceita offsets de 64 bits) e só o áudio, uns 5% do arquivo, segue para o ffmpeg.
 */

/** Acima disto o ffmpeg.wasm não consegue abrir o arquivo (2 GiB, com folga). */
export const LIMITE_FFMPEG_BYTES = 2 ** 31 - 2 ** 24

export interface AudioAac {
  /** Fluxo ADTS (.aac), que o ffmpeg abre sem precisar do mp4. */
  blob: Blob
  /** Duração segundo o cabeçalho do mp4 (null se ausente). */
  duracaoSegundos: number | null
}

interface Caixa {
  tipo: string
  ini: number
  fim: number
}

interface FaixaAudio {
  asc: Uint8Array
  tamanhos: Uint32Array
  offsetsChunks: Float64Array
  /** Entradas do stsc: a partir do chunk `primeiro` (base 1), cada chunk tem `porChunk` amostras. */
  stsc: { primeiro: number; porChunk: number }[]
  duracaoSegundos: number | null
}

/** Tamanho máximo de cada leitura do arquivo; o áudio de vários chunks vizinhos sai de uma só. */
const TAMANHO_JANELA = 16 * 1024 * 1024
const LEITURAS_PARALELAS = 4
/** Índices de taxa de amostragem do MPEG-4 Audio (ADTS só aceita os 13 primeiros). */
const MAX_INDICE_TAXA = 12

const tipoEm = (dv: DataView, o: number) =>
  String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3))

async function lerBytes(blob: Blob, ini: number, fim: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(ini, fim).arrayBuffer())
}

function filhos(dv: DataView, ini: number, fim: number): Caixa[] {
  const lista: Caixa[] = []
  let o = ini
  while (o + 8 <= fim) {
    let tamanho = dv.getUint32(o)
    let cabecalho = 8
    if (tamanho === 1) {
      tamanho = Number(dv.getBigUint64(o + 8))
      cabecalho = 16
    } else if (tamanho === 0) {
      tamanho = fim - o
    }
    if (tamanho < cabecalho || o + tamanho > fim) break
    lista.push({ tipo: tipoEm(dv, o + 4), ini: o + cabecalho, fim: o + tamanho })
    o += tamanho
  }
  return lista
}

const filho = (dv: DataView, pai: Caixa, tipo: string) => filhos(dv, pai.ini, pai.fim).find((c) => c.tipo === tipo)

/** Percorre as caixas do nível raiz pelo cabeçalho e devolve só o conteúdo do "moov". */
async function lerMoov(video: Blob): Promise<DataView> {
  let pos = 0
  while (pos + 8 <= video.size) {
    const cab = await lerBytes(video, pos, pos + 16)
    const dv = new DataView(cab.buffer)
    let tamanho = dv.getUint32(0)
    let cabecalho = 8
    if (tamanho === 1) {
      if (cab.byteLength < 16) break
      tamanho = Number(dv.getBigUint64(8))
      cabecalho = 16
    } else if (tamanho === 0) {
      tamanho = video.size - pos
    }
    if (tamanho < cabecalho) break
    if (tipoEm(dv, 4) === 'moov') {
      const dados = await lerBytes(video, pos + cabecalho, pos + tamanho)
      return new DataView(dados.buffer)
    }
    pos += tamanho
  }
  throw new Error('Arquivo mp4 inválido ou incompleto: índice (moov) não encontrado.')
}

/** Lê um descritor MPEG-4 (tag + tamanho de 7 bits por byte). */
function descritor(d: Uint8Array, o: number) {
  let comprimento = 0
  let i = o + 1
  for (let k = 0; k < 4; k++) {
    const b = d[i++] ?? 0
    comprimento = (comprimento << 7) | (b & 0x7f)
    if (!(b & 0x80)) break
  }
  return { tag: d[o], ini: i, fim: i + comprimento }
}

/** Extrai o AudioSpecificConfig de dentro da caixa "esds". */
function lerAsc(dv: DataView, esds: Caixa): Uint8Array {
  const d = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
  const es = descritor(d, esds.ini + 4)
  if (es.tag !== 0x03) throw new Error('Áudio do mp4 em formato não reconhecido (esds).')
  let p = es.ini + 2
  const flags = d[p++] ?? 0
  if (flags & 0x80) p += 2
  if (flags & 0x40) p += 1 + (d[p] ?? 0)
  if (flags & 0x20) p += 2
  const config = descritor(d, p)
  if (config.tag !== 0x04) throw new Error('Áudio do mp4 em formato não reconhecido (esds).')
  if (d[config.ini] !== 0x40) throw new Error('O áudio deste vídeo não é AAC.')
  const especifico = descritor(d, config.ini + 13)
  if (especifico.tag !== 0x05) throw new Error('Áudio do mp4 em formato não reconhecido (esds).')
  return d.subarray(especifico.ini, especifico.fim)
}

function lerFaixaAudio(dv: DataView, trak: Caixa): FaixaAudio | null {
  const mdia = filho(dv, trak, 'mdia')
  const hdlr = mdia && filho(dv, mdia, 'hdlr')
  if (!mdia || !hdlr || tipoEm(dv, hdlr.ini + 8) !== 'soun') return null

  const mdhd = filho(dv, mdia, 'mdhd')
  let duracaoSegundos: number | null = null
  if (mdhd) {
    const v1 = dv.getUint8(mdhd.ini) === 1
    const escala = dv.getUint32(mdhd.ini + (v1 ? 20 : 12))
    const duracao = v1 ? Number(dv.getBigUint64(mdhd.ini + 24)) : dv.getUint32(mdhd.ini + 16)
    if (escala > 0 && duracao > 0) duracaoSegundos = duracao / escala
  }

  const minf = filho(dv, mdia, 'minf')
  const stbl = minf && filho(dv, minf, 'stbl')
  const stsd = stbl && filho(dv, stbl, 'stsd')
  const stsz = stbl && filho(dv, stbl, 'stsz')
  const stsc = stbl && filho(dv, stbl, 'stsc')
  const stco = stbl && filho(dv, stbl, 'stco')
  const co64 = stbl && filho(dv, stbl, 'co64')
  if (!stsd || !stsz || !stsc || !(stco || co64)) throw new Error('Trilha de áudio do mp4 incompleta.')

  const entrada = stsd.ini + 8
  const tipoEntrada = tipoEm(dv, entrada + 4)
  if (tipoEntrada !== 'mp4a') throw new Error(`O áudio deste vídeo (${tipoEntrada}) não é AAC.`)
  const versaoEntrada = dv.getUint16(entrada + 16)
  const extra = versaoEntrada === 1 ? 16 : versaoEntrada === 2 ? 36 : 0
  const esds = filhos(dv, entrada + 36 + extra, entrada + dv.getUint32(entrada)).find((c) => c.tipo === 'esds')
  if (!esds) throw new Error('Áudio do mp4 sem configuração AAC (esds).')

  const tamanhoFixo = dv.getUint32(stsz.ini + 4)
  const quantidade = dv.getUint32(stsz.ini + 8)
  if (quantidade === 0) throw new Error('mp4 fragmentado não é suportado para vídeos grandes.')
  const tamanhos = new Uint32Array(quantidade)
  for (let i = 0; i < quantidade; i++) {
    tamanhos[i] = tamanhoFixo || dv.getUint32(stsz.ini + 12 + i * 4)
  }

  const origem = (stco ?? co64)!
  const nChunks = dv.getUint32(origem.ini + 4)
  const offsetsChunks = new Float64Array(nChunks)
  for (let i = 0; i < nChunks; i++) {
    offsetsChunks[i] = stco ? dv.getUint32(origem.ini + 8 + i * 4) : Number(dv.getBigUint64(origem.ini + 8 + i * 8))
  }

  const nStsc = dv.getUint32(stsc.ini + 4)
  const entradasStsc: FaixaAudio['stsc'] = []
  for (let i = 0; i < nStsc; i++) {
    const o = stsc.ini + 8 + i * 12
    entradasStsc.push({ primeiro: dv.getUint32(o), porChunk: dv.getUint32(o + 4) })
  }

  return { asc: lerAsc(dv, esds), tamanhos, offsetsChunks, stsc: entradasStsc, duracaoSegundos }
}

/** Lê objeto, taxa e canais do AudioSpecificConfig, no formato exigido pelo cabeçalho ADTS. */
function interpretarAsc(asc: Uint8Array): { objeto: number; taxa: number; canais: number } {
  let bit = 0
  const ler = (n: number) => {
    let v = 0
    for (let i = 0; i < n; i++, bit++) v = (v << 1) | (((asc[bit >> 3] ?? 0) >> (7 - (bit & 7))) & 1)
    return v
  }
  let objeto = ler(5)
  if (objeto === 31) objeto = 32 + ler(6)
  const taxa = ler(4)
  const canais = ler(4)
  if (objeto === 5 || objeto === 29) {
    // SBR/PS explícito: o objeto do núcleo AAC vem depois da taxa de extensão.
    if (ler(4) === 15) ler(24)
    objeto = ler(5)
  }
  if (objeto < 1 || objeto > 4 || taxa > MAX_INDICE_TAXA || canais < 1 || canais > 7) {
    throw new Error('Formato de áudio AAC não suportado para vídeos grandes.')
  }
  return { objeto, taxa, canais }
}

function cabecalhoAdts(objeto: number, taxa: number, canais: number, tamanhoAmostra: number): Uint8Array {
  const total = tamanhoAmostra + 7
  return Uint8Array.of(
    0xff,
    0xf1,
    ((objeto - 1) << 6) | (taxa << 2) | (canais >> 2),
    ((canais & 3) << 6) | (total >> 11),
    (total >> 3) & 0xff,
    ((total & 7) << 5) | 0x1f,
    0xfc,
  )
}

/** Extrai o áudio AAC do mp4 como fluxo ADTS, sem carregar o vídeo na memória. */
export async function lerAudioAac(video: Blob, onProgress?: (fracao: number) => void): Promise<AudioAac> {
  const moov = await lerMoov(video)
  const raiz: Caixa = { tipo: 'moov', ini: 0, fim: moov.byteLength }

  let faixa: FaixaAudio | null = null
  for (const trak of filhos(moov, raiz.ini, raiz.fim).filter((c) => c.tipo === 'trak')) {
    faixa = lerFaixaAudio(moov, trak)
    if (faixa) break
  }
  if (!faixa) throw new Error('Este vídeo não tem trilha de áudio.')

  const { objeto, taxa, canais } = interpretarAsc(faixa.asc)
  const { tamanhos, offsetsChunks, stsc } = faixa

  // Para cada chunk: onde começa no arquivo, qual a primeira amostra e quantas amostras tem.
  const primeiraAmostra = new Uint32Array(offsetsChunks.length)
  const qtdAmostras = new Uint32Array(offsetsChunks.length)
  let amostra = 0
  let entrada = 0
  for (let c = 0; c < offsetsChunks.length && amostra < tamanhos.length; c++) {
    while (entrada + 1 < stsc.length && stsc[entrada + 1]!.primeiro <= c + 1) entrada++
    const n = Math.min(stsc[entrada]?.porChunk ?? 0, tamanhos.length - amostra)
    primeiraAmostra[c] = amostra
    qtdAmostras[c] = n
    amostra += n
  }

  const bytesChunk = new Float64Array(offsetsChunks.length)
  for (let c = 0; c < offsetsChunks.length; c++) {
    for (let s = primeiraAmostra[c]!; s < primeiraAmostra[c]! + qtdAmostras[c]!; s++) bytesChunk[c]! += tamanhos[s]!
  }

  // Cada Blob.slice().arrayBuffer() custa caro no navegador (o Blob vem do IndexedDB) e o áudio
  // fica picado em milhares de chunks entre os quadros de vídeo. Por isso lê janelas grandes
  // que cobrem vários chunks vizinhos e recorta o áudio de dentro delas.
  const janelas: { primeiro: number; fim: number; ini: number; bytes: number }[] = []
  for (let c = 0; c < offsetsChunks.length; c++) {
    const ini = offsetsChunks[c]!
    const fimChunk = ini + bytesChunk[c]!
    const atual = janelas.at(-1)
    // Só agrupa chunks em ordem crescente no arquivo (o normal); fora de ordem abre outra janela.
    if (atual && ini >= offsetsChunks[c - 1]! && fimChunk - atual.ini <= TAMANHO_JANELA) {
      atual.fim = c + 1
      atual.bytes = Math.max(atual.bytes, fimChunk - atual.ini)
    } else {
      janelas.push({ primeiro: c, fim: c + 1, ini, bytes: fimChunk - ini })
    }
  }

  const partes: Uint8Array[] = []
  for (let inicio = 0; inicio < janelas.length; inicio += LEITURAS_PARALELAS) {
    const lote = janelas.slice(inicio, inicio + LEITURAS_PARALELAS)
    const lidos = await Promise.all(lote.map((j) => lerBytes(video, j.ini, j.ini + j.bytes)))

    lote.forEach((janela, i) => {
      const dados = lidos[i]!
      for (let c = janela.primeiro; c < janela.fim; c++) {
        const saida = new Uint8Array(bytesChunk[c]! + 7 * qtdAmostras[c]!)
        let de = offsetsChunks[c]! - janela.ini
        let para = 0
        for (let s = primeiraAmostra[c]!; s < primeiraAmostra[c]! + qtdAmostras[c]!; s++) {
          saida.set(cabecalhoAdts(objeto, taxa, canais, tamanhos[s]!), para)
          saida.set(dados.subarray(de, de + tamanhos[s]!), para + 7)
          de += tamanhos[s]!
          para += tamanhos[s]! + 7
        }
        partes.push(saida)
      }
    })
    onProgress?.(Math.min(janelas.length, inicio + LEITURAS_PARALELAS) / janelas.length)
  }

  return { blob: new Blob(partes as BlobPart[], { type: 'audio/aac' }), duracaoSegundos: faixa.duracaoSegundos }
}

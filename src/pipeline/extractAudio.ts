import { apagarArquivos, execFFmpeg, lerArquivo, montarBlob } from '@/ffmpeg/client'
import type { ParteAudio } from '@/db'
import { LIMITE_AUDIO_BYTES } from '@/lib/groq'
import { LIMITE_FFMPEG_BYTES, lerAudioAac } from './mp4Audio'

/** 32 kbps = 4000 bytes por segundo → cerca de 14 MB por hora de áudio. */
const BITRATE_KBPS = 32
/** 90 min a 32 kbps ≈ 21,6 MB, abaixo do limite de upload do Whisper. */
const DURACAO_PARTE_S = 90 * 60

const SAIDA = '/audio.mp3'

export interface AudioExtraido {
  partes: ParteAudio[]
  /** Duração do vídeo segundo o ffmpeg (null se não conseguiu ler). */
  duracaoSegundos: number | null
}

/** Extrai áudio mono 16 kHz em mp3 32 kbps e divide em partes se passar do limite do Whisper. */
export async function extrairAudio(
  video: Blob,
  onProgress: (fracao: number) => void,
): Promise<AudioExtraido> {
  // O ffmpeg.wasm não abre arquivos de 2 GiB ou mais: nesses, separa o áudio antes (ver mp4Audio.ts).
  let fonte: Blob = video
  let duracaoMp4: number | null = null
  let inicioConversao = 0
  if (video.size >= LIMITE_FFMPEG_BYTES) {
    const aac = await lerAudioAac(video, (f) => onProgress(f * 0.3))
    fonte = aac.blob
    duracaoMp4 = aac.duracaoSegundos
    inicioConversao = 0.3
  }

  const entrada = await montarBlob(fonte, fonte === video ? 'video' : 'audio.aac')
  try {
    const { duracaoEntrada: duracaoLida } = await execFFmpeg(
      ['-i', entrada.caminho, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', `${BITRATE_KBPS}k`, SAIDA],
      // A divisão em partes é rápida (só copia); a conversão ocupa quase todo o tempo.
      {
        duracaoSaida: duracaoMp4 ?? undefined,
        onProgress: (f) => onProgress(inicioConversao + f * (0.95 - inicioConversao)),
      },
    )
    // Um .aac cru não informa a duração ao ffmpeg; nesse caso vale a do mp4.
    const duracaoEntrada = duracaoMp4 ?? duracaoLida
    const audio = await lerArquivo(SAIDA, 'audio/mpeg')

    if (audio.size <= LIMITE_AUDIO_BYTES) {
      return { partes: [{ blob: audio, inicio: 0 }], duracaoSegundos: duracaoEntrada }
    }

    const duracaoTotal = duracaoEntrada ?? (audio.size * 8) / (BITRATE_KBPS * 1000)
    const partes: ParteAudio[] = []
    for (let inicio = 0; inicio < duracaoTotal; inicio += DURACAO_PARTE_S) {
      const caminhoParte = `/parte-${partes.length}.mp3`
      // -c copy corta nos quadros do mp3 (~36 ms a 16 kHz), precisão suficiente para os offsets.
      await execFFmpeg(['-ss', String(inicio), '-t', String(DURACAO_PARTE_S), '-i', SAIDA, '-c', 'copy', caminhoParte])
      partes.push({ blob: await lerArquivo(caminhoParte, 'audio/mpeg'), inicio })
      await apagarArquivos(caminhoParte)
      onProgress(0.95 + 0.05 * Math.min(1, (inicio + DURACAO_PARTE_S) / duracaoTotal))
    }
    return { partes, duracaoSegundos: duracaoEntrada }
  } catch (error) {
    if (error instanceof Error && error.message.includes('moov atom not found')) {
      throw new Error(
        'Vídeo incompleto ou corrompido: falta o índice do mp4 (comum quando um download, gravação ou compressão foi interrompido). Gere o arquivo de novo.',
        { cause: error },
      )
    }
    throw error
  } finally {
    await apagarArquivos(SAIDA)
    await entrada.desmontar()
  }
}

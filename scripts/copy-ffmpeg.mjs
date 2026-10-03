// Copia os arquivos do ffmpeg.wasm para public/ffmpeg.
// Motivo: em dev o Vite transforma arquivos importados de node_modules (injeta um import do
// "/@vite/client"), o que quebra o worker clássico do core multithread. A pasta public é
// servida sem transformação, em dev e no build.
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const destino = join(import.meta.dirname, '..', 'public', 'ffmpeg')
const pacotes = { mt: '@ffmpeg/core-mt', st: '@ffmpeg/core' }

for (const [pasta, pacote] of Object.entries(pacotes)) {
  const origem = join(import.meta.dirname, '..', 'node_modules', pacote, 'dist', 'esm')
  mkdirSync(join(destino, pasta), { recursive: true })
  cpSync(origem, join(destino, pasta), { recursive: true })
}
console.log('ffmpeg.wasm copiado para public/ffmpeg')

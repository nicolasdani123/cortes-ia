// Servidor só da API do YouTube, sem o Vite, para rodar no Render (veja Dockerfile e render.yaml).
// O site (Firebase) chama este servidor de outra origem, então aqui entram CORS e a checagem de origem.
//
//   node server/standalone.ts
//
// Variáveis: PORT, ORIGENS_PERMITIDAS (separadas por vírgula; vazio libera qualquer origem),
// YTDLP_PATH, YTDLP_COOKIES, YTDLP_PROXY, MAX_DOWNLOADS_SIMULTANEOS.
import { createServer } from 'node:http'
import { middlewareYoutube } from './youtube.ts'

const PORTA = Number(process.env.PORT) || 3001
const ORIGENS_PERMITIDAS = (process.env.ORIGENS_PERMITIDAS ?? '')
  .split(',')
  .map((origem) => origem.trim().replace(/\/$/, ''))
  .filter(Boolean)

function origemPermitida(origem: string): boolean {
  return ORIGENS_PERMITIDAS.length === 0 || ORIGENS_PERMITIDAS.includes(origem)
}

const servidor = createServer((req, res) => {
  const origem = req.headers.origin
  if (origem) {
    if (!origemPermitida(origem)) {
      res.statusCode = 403
      return res.end()
    }
    res.setHeader('Access-Control-Allow-Origin', origem)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Vary', 'Origin')
  }
  // O site usa COEP require-corp (ffmpeg.wasm multithread); isto deixa ele carregar as respostas daqui.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }
  // Health check do Render.
  if (req.url === '/saude') return res.end('ok')

  middlewareYoutube(req, res, () => {
    res.statusCode = 404
    res.end()
  })
})

servidor.listen(PORTA, () => {
  console.log(`[youtube] servidor ouvindo na porta ${PORTA}`)
  if (ORIGENS_PERMITIDAS.length === 0) console.warn('[youtube] ORIGENS_PERMITIDAS vazio: qualquer site pode usar a API')
})

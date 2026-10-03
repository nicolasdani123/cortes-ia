# Servidor de download do YouTube (server/standalone.ts) para o Render.
# O Node 24 roda TypeScript direto (type stripping), então não precisa de build nem de npm install.
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json ./
COPY server ./server

ENV NODE_ENV=production \
  YTDLP_PATH=/usr/local/bin/yt-dlp

CMD ["node", "server/standalone.ts"]

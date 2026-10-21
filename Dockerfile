FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY market-api ./market-api
COPY backend ./backend
COPY config/agent-profiles.json ./config/agent-profiles.json
COPY config/devnet-markets.example.json ./config/devnet-markets.json

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "market-api/server.js"]

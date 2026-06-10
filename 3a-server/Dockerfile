# UVS 3A — anchored-draw server. Debian base guarantees `openssl ts` (needed for RFC 3161).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# OpenTimestamps (opentimestamps@0.4.9, pure-JS deps) powers the §5.4 second anchor AND the game's
# settled-record trail-immutability path (notary now → 🟢 after Bitcoin). Best-effort install: the
# `|| echo` guarantees the image still builds even if the install hiccups; then the server simply
# runs without OTS (ots:false) and the RFC-3161 paths are unaffected.
RUN npm install --omit=dev --no-audit --no-fund || echo "OTS optional dep skipped — server runs without it"
ENV UVS_ROUND_AHEAD=10
# Render injects $PORT; the server reads process.env.PORT.
CMD ["node", "3a-server.js"]

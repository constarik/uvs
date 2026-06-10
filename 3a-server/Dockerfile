# UVS 3A — anchored-draw server. Debian base guarantees `openssl ts` (needed for RFC 3161).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# OpenTimestamps is the optional FREE SECOND anchor. Best-effort install: if it fails, the build
# still succeeds and the server runs 🟢 on the RFC-3161 tokens alone (the module degrades gracefully).
RUN npm install --omit=dev --no-audit --no-fund || echo "OTS optional dep skipped — server runs without it"
ENV UVS_ROUND_AHEAD=30
# Render injects $PORT; the server reads process.env.PORT.
CMD ["node", "3a-server.js"]

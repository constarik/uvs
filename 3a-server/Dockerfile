# UVS 3A — anchored-draw server. Debian base guarantees `openssl ts` (needed for RFC 3161).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# Core server uses Node built-ins only — no npm install needed, so the image builds fast and can't
# fail on a dependency. OpenTimestamps (the optional FREE SECOND anchor) is OFF by default; to enable
# it, add a `RUN npm install --omit=dev --no-audit --no-fund || true` line below and redeploy. Without
# it the server still issues genuine 🟢 draws on the ×2 RFC-3161 tokens alone.
ENV UVS_ROUND_AHEAD=10
# Render injects $PORT; the server reads process.env.PORT.
CMD ["node", "3a-server.js"]

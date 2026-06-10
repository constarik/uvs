# UVS 3A — anchored-draw server. Debian base guarantees `openssl ts` (needed for RFC 3161).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ENV UVS_ROUND_AHEAD=9
# Render injects $PORT; the server reads process.env.PORT.
CMD ["node", "3a-server.js"]

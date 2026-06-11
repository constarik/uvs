# UVS 3A — anchored-draw server. Debian base guarantees `openssl ts` (needed for RFC 3161).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# OpenTimestamps (Bitcoin trail-immutability) is OFF for now — nobody's relying on the slow Bitcoin
# maturation yet, so we skip the install to keep the image dependency-free and fast. The OTS code
# stays dormant (ots:false everywhere; RFC-3161 paths unaffected). To turn it back on, restore:
#   RUN npm install --omit=dev --no-audit --no-fund || echo "OTS optional dep skipped"
ENV UVS_ROUND_AHEAD=10
# Render injects $PORT; the server reads process.env.PORT.
CMD ["node", "3a-server.js"]

# UVS 3A — anchored-draw server. Debian base guarantees `openssl ts` (needed for RFC 3161).
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# TSA trust roots, fetched at BUILD time directly from each TSA (uvLs §5.4: the trust anchor must
# not come from the operator). The host uses this bundle to VERIFY tokens before deriving 🟢.
# freetsa.org renewed its TSA cert 2026-03 — always build with fresh roots.
RUN curl -fsSL https://freetsa.org/files/cacert.pem -o /tmp/freetsa-root.pem \
 && curl -fsSL https://cacerts.digicert.com/DigiCertTrustedRootG4.crt.pem -o /tmp/digicert-g4-root.pem \
 && openssl x509 -in /tmp/freetsa-root.pem -noout -subject \
 && openssl x509 -in /tmp/digicert-g4-root.pem -noout -subject \
 && cat /tmp/freetsa-root.pem /tmp/digicert-g4-root.pem > /app/tsa-ca-bundle.pem
# OpenTimestamps (Bitcoin trail-immutability) is OFF for now — nobody's relying on the slow Bitcoin
# maturation yet, so we skip the install to keep the image dependency-free and fast. The OTS code
# stays dormant (ots:false everywhere; RFC-3161 paths unaffected). To turn it back on, restore:
#   RUN npm install --omit=dev --no-audit --no-fund || echo "OTS optional dep skipped"
ENV UVS_ROUND_AHEAD=10
# Render injects $PORT; the server reads process.env.PORT.
CMD ["node", "3a-server.js"]

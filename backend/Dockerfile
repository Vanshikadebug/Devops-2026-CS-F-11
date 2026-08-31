# ---- ReuseHub API image ----------------------------------------------
# Build context is the repo root, so paths below are backend/*.
FROM node:20-alpine

WORKDIR /app

# openssl is required by Prisma's query engine at runtime.
RUN apk add --no-cache openssl

# Manifests first, so this layer is cached until a dependency changes.
COPY backend/package.json backend/package-lock.json ./

# --ignore-scripts because the API's postinstall runs `prisma generate`, which
# needs prisma/schema.prisma -- and the schema is not in the image yet. Copying
# it earlier would work but would invalidate this layer on every schema edit.
# The client is generated explicitly below instead.
RUN npm ci --omit=dev --ignore-scripts

COPY backend ./


# Now the schema exists, so the client can be built for this platform.
RUN npx prisma generate

EXPOSE 5000

# The compose `command` runs migrate + seed before this; kept as the fallback.
CMD ["node", "src/server.js"]

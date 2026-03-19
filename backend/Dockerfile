# ─────────────────────────────────────
#  LumiPlus Backend — Dockerfile
#  Multi-stage: build → production
# ─────────────────────────────────────

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia manifests para cache de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instala todas as dependências (incluindo devDeps para build)
RUN npm ci

# Gera Prisma client
RUN npx prisma generate

# Copia fonte e compila TypeScript
COPY . .
RUN npm run build

# ─────────────────────────────────────
# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Instala apenas dependências de produção
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npm cache clean --force

# Gera Prisma client novamente (para produção)
RUN npx prisma generate

# Copia build compilado
COPY --from=builder /app/dist ./dist

# Script de entrypoint (migrations + start)
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]

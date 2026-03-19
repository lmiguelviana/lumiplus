#!/bin/bash
# ─────────────────────────────────────────────────────────
#  LumiPlus — Script de Instalação Automática
#  Uso: curl -fsSL https://raw.githubusercontent.com/SEU_USER/lumiplus/main/install.sh | bash
#  Ou:  chmod +x install.sh && ./install.sh
# ─────────────────────────────────────────────────────────

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       LumiPlus — Instalador v1.0     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Verifica dependências ──────────────────────────────────
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $1 não encontrado. Instale antes de continuar.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1${NC}"
}

echo -e "${BOLD}Verificando dependências...${NC}"
check_dep docker
check_dep docker compose 2>/dev/null || check_dep "docker-compose"
echo ""

# ── Cria .env se não existir ──────────────────────────────
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}⚙  Criando arquivo .env a partir do .env.example...${NC}"
  cp .env.example .env

  # Gera JWT_SECRET aleatório
  JWT_SECRET=$(openssl rand -base64 48 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 48 | head -n 1)
  sed -i "s|troque_por_string_aleatoria_de_pelo_menos_32_chars_aqui|${JWT_SECRET}|g" .env

  # Gera VAULT_MASTER_KEY aleatório (32 bytes hex)
  VAULT_KEY=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
  sed -i "s|000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f|${VAULT_KEY}|g" .env

  echo ""
  echo -e "${YELLOW}⚠️  IMPORTANTE: Edite o arquivo .env e configure:${NC}"
  echo -e "   - ${BOLD}OPENROUTER_API_KEY${NC} (necessário para IA funcionar)"
  echo -e "   - ${BOLD}DATABASE_URL${NC} (se usar banco externo)"
  echo ""
  read -p "Pressione ENTER após configurar o .env para continuar..."
else
  echo -e "${GREEN}✓ .env já existe${NC}"
fi

echo ""
echo -e "${BOLD}Iniciando containers...${NC}"

# ── Build e start ──────────────────────────────────────────
docker compose pull postgres redis 2>/dev/null || true
docker compose up -d --build

echo ""
echo -e "${BOLD}Aguardando serviços ficarem prontos...${NC}"
sleep 5

# Aguarda backend healthcheck
echo -n "Aguardando backend"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo ""
    break
  fi
  echo -n "."
  sleep 3
done

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║      ✅ LumiPlus instalado!          ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Dashboard: ${BOLD}http://localhost:3000${NC}"
echo -e "  API:       ${BOLD}http://localhost:3001${NC}"
echo -e "  Health:    ${BOLD}http://localhost:3001/health${NC}"
echo ""
echo -e "  ${YELLOW}Para parar:${NC}  docker compose down"
echo -e "  ${YELLOW}Para logs:${NC}   docker compose logs -f"
echo ""

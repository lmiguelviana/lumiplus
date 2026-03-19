# Lumi Plus — Framework Profissional de Agentes de IA

Plataforma multi-tenant para criação, orquestração e gerenciamento de Agentes de IA. Escalável, seguro e totalmente extensível.

## Funcionalidades

- **Multi-Provider IA:** Suporte a OpenRouter, Claude, GPT, Gemini, DeepSeek com fallback automático
- **Auto-Configuração:** Agentes se configuram sozinhos via chat — instalam skills, salvam APIs, atualizam soul
- **Multicanal:** Telegram, WhatsApp, Discord e chat web nativos
- **Squads & Workflows:** Canvas visual de fluxos com agentes, motor de execução e BullMQ
- **Knowledge Hub (RAG):** Busca vetorial com pgvector + fragmentos de conhecimento por agente
- **CronJobs via Chat:** Agentes criam agendamentos recorrentes por conversa
- **Marketplace de Skills:** 30+ skills instaláveis + skills personalizadas (APIs externas)
- **Multi-tenant:** Isolamento completo por workspace com vault de credenciais AES-256-GCM
- **Suporte SQLite + PostgreSQL:** Instalação local ou cloud

---

## Instalação Rápida (Docker)

```bash
git clone https://github.com/SEU_USER/lumiplus.git
cd lumiplus
chmod +x install.sh && ./install.sh
```

O script gera as chaves automaticamente, sobe todos os containers e aguarda o sistema ficar pronto.

Após a instalação:
- Dashboard: **http://localhost:3000**
- API: **http://localhost:3001**

---

## Instalação Manual

```bash
# 1. Clone e configure o ambiente
git clone https://github.com/SEU_USER/lumiplus.git
cd lumiplus
cp .env.example .env
# Edite .env com suas chaves

# 2. Sobe com Docker Compose
docker compose up -d

# 3. Ou rode localmente (sem Docker)
cd backend && npm install && npm run dev
cd ../dashboard && npm install && npm run dev
```

---

## Deploy no EasyPanel (VPS)

### Pré-requisitos
- VPS com EasyPanel instalado
- PostgreSQL (use o serviço interno do EasyPanel ou externo)
- Redis (opcional — workflows funcionam sem ele)

### Passo a passo

**1. Crie os serviços no EasyPanel:**

| Serviço | Tipo | Porta |
|---------|------|-------|
| `lumiplus-backend` | App (Docker) | 3001 |
| `lumiplus-dashboard` | App (Docker) | 3000 |
| `lumiplus-postgres` | PostgreSQL | 5432 |
| `lumiplus-redis` | Redis | 6379 (opcional) |

**2. Configure o Backend no EasyPanel:**
- Source: GitHub → `SEU_USER/lumiplus` → pasta `backend/`
- Dockerfile: `backend/Dockerfile`
- Porta: `3001`

Variáveis de ambiente obrigatórias:
```
DATABASE_URL=postgresql://user:pass@host:5432/lumiplus_db
JWT_SECRET=<string 32+ chars aleatória>
VAULT_MASTER_KEY=<64 chars hex — openssl rand -hex 32>
OPENROUTER_API_KEY=sk-or-v1-xxxx
NODE_ENV=production
```

**3. Configure o Dashboard no EasyPanel:**
- Source: GitHub → `SEU_USER/lumiplus` → pasta `dashboard/`
- Dockerfile: `dashboard/Dockerfile`
- Build arg: `NEXT_PUBLIC_API_URL=https://api.seudominio.com`
- Porta: `3000`

**4. Configure domínios:**
- `app.seudominio.com` → dashboard (porta 3000)
- `api.seudominio.com` → backend (porta 3001)

---

## Variáveis de Ambiente

Veja [.env.example](.env.example) para a lista completa com descrições.

**Obrigatórias:**
| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | PostgreSQL ou `file:./dev.db` para SQLite |
| `JWT_SECRET` | Mínimo 32 caracteres |
| `VAULT_MASTER_KEY` | 64 chars hex (`openssl rand -hex 32`) |
| `OPENROUTER_API_KEY` | Chave OpenRouter para IA |

---

## Estrutura do Projeto

```
lumiplus/
├── backend/          # API Fastify + Prisma + Skills
├── dashboard/        # Interface Web Next.js
├── cli/              # CLI de setup
├── docs/             # Documentação detalhada por fase
├── .env.example      # Template de variáveis de ambiente
├── docker-compose.yml
└── install.sh        # Script de instalação automática
```

---

## Documentação

- [Fases do Projeto](docs/fase_atual/README.md) — histórico detalhado de implementação
- [Arquitetura](ARCHITECTURE.md)

---

## Status (Março 2026)

Fase 35 concluída — auto-configuração de agentes, suporte SQLite, workflows refatorados, marketplace de skills com aba Personalizadas, cronjobs via chat, importação do ClawhHub.ai.

Versão: 2.7 (Orquestração via Comandos)

---

## 1. Princípios Arquiteturais

- **Sem lock-in:** roda em qualquer VPS, servidor ou PC com Node.js. Não depende de IDE específica.
- **Self-hosted first:** o usuário controla onde seus dados ficam
- **Multi-tenant seguro:** workspaces completamente isolados desde o banco até a execução
- **Resiliente:** 5 níveis de fallback para IA, retry automático, nunca falha silenciosamente
- **Escalável progressivamente:** começa leve (SQLite/Supabase), cresce para PostgreSQL gerenciado

---

## 2. Stack Técnica

### Frontend
| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Web app | React + Next.js | SSR, roteamento, performance |
| Squad builder visual | React Flow | Canvas drag-and-drop nativo |
| Mobile | React Native | iOS + Android, reuso de código |
| Estado global | Zustand | Leve e simples |
| UI components | Tailwind CSS + Radix UI | Design system consistente |

### Backend
| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Runtime | Node.js 20+ | Compatibilidade com CLI e server |
| Framework | Fastify | Alta performance, baixo overhead |
| ORM | Prisma | Type-safe, migrations automáticas |
| Testes | Vitest | Framework de testes unitários e mocks |
| Filas | BullMQ | Execução assíncrona de agentes |
| WebSockets | Socket.io | Status ao vivo no dashboard |

### Banco de Dados
| Uso | Tecnologia | Notas |
|-----|-----------|-------|
| Dados principais | PostgreSQL 15+ | RLS nativo, JSON, full-text search |
| Cache / sessões | Redis 7 | TTL automático, pub/sub (Opcional) |
| Embeddings | pgvector (extensão PG) | Memória semântica do agente |
| Arquivos | S3-compatible | MinIO (self-hosted) ou AWS S3 |

### IA
| Componente | Tecnologia |
|-----------|-----------|
| Gateway principal | OpenRouter |
| Fallback externo | SDK Anthropic + SDK Google direto |
| Embeddings | text-embedding-3-small (OpenAI) ou alternativa via OpenRouter |
| Web search | Ferramenta via OpenRouter / Tavily API |
| Transcrição de áudio (v1.1) | Whisper API |

### Infraestrutura
| Componente | Tecnologia |
|-----------|-----------|
| Containerização | Docker + Docker Compose |
| Reverse proxy | Nginx ou Caddy |
| CI/CD | GitHub Actions |
| Monitoramento | Prometheus + Grafana |
| Logs | Loki + Grafana (ou ELK) |
| Tracing | OpenTelemetry |

---

## 3. Modos de Deploy

### Modo 1: Lumi Cloud (padrão para novos usuários)
- Supabase gerenciado pelo Lumi Plus
- Zero configuração pelo usuário
- Ideal para protótipo e não-técnicos

### Modo 2: Supabase Próprio
- Usuário traz URL + anon key do projeto Supabase dele
- Dados ficam na conta do usuário
- CLI configura automaticamente via `lumi init --supabase`

### Modo 3: Self-Hosted Total
- PostgreSQL + Redis + MinIO via Docker Compose
- CLI gera `docker-compose.yml` configurado automaticamente
- `lumi init --self-hosted` → sobe tudo localmente
- Ideal para VPS, servidor próprio ou PC dedicado
- **Sem dependência de nenhum serviço externo**

---

## 4. Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────┐
│                   CLIENTES                          │
│   Web App (React)  │  Mobile (RN)  │  CLI  │  API  │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────┐
│                 GATEWAY / NGINX                     │
│         Rate limiting · TLS · Load balance          │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│                  CORE API (Fastify)                 │
│   Auth · REST /v1 · WebSocket · Webhook receiver   │
└───┬──────────┬──────────┬──────────┬───────────────┘
    │          │          │          │
    ▼          ▼          ▼          ▼
┌───────┐ ┌────────┐ ┌────────┐ ┌──────────────────┐
│  Auth │ │ Squad  │ │ Agent  │ │   Webhook        │
│Service│ │Service │ │Service │ │   Gateway        │
└───────┘ └────────┘ └───┬────┘ │ (WA/TG/etc)     │
                         │      └──────────────────┘
                         ▼
┌────────────────────────────────────────────────────┐
│               AGENT ORCHESTRATOR                  │
│   Task Dispatcher (BullMQ / In-Process)           │
│   Agent-Employee Hierarchy (Leader-Follower)      │
│   Zero-Redis Fallback Resilience                  │
└────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Agent Runner│ │  Agent Runner│ │  Agent Runner│
│  (BullMQ)    │ │  (BullMQ)    │ │  (BullMQ)    │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌────────────────────────────────────────────────────┐
│            CAMADA DE ABSTRAÇÃO DE IA              │
│   OpenRouter (primary) · SDK Anthropic · SDK GCP  │
│   Fallback chain: model 1 → 2 → 3 → 4 → cache    │
└────────────────────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│  PostgreSQL  │ │    Redis    │ │   pgvector   │
│  + RLS       │ │  (cache/   │ │  (embeddings)│
│  (dados)     │ │   sessões) │ │              │
└──────────────┘ └─────────────┘ └──────────────┘
```

---

## 5. Gateway de Daemon (Processo Persistente)

O gateway precisa ficar rodando 24/7 para que os agentes respondam a qualquer hora.

**Em servidor/VPS:**
```bash
# Instala como serviço systemd automaticamente
lumi gateway --install-daemon
systemctl enable lumiplus-gateway
systemctl start lumiplus-gateway
```

**Em desenvolvimento / PC:**
```bash
lumi gateway --port 3001
# Ou via PM2
pm2 start lumi -- gateway
```

**Docker (recomendado para self-hosted):**
```yaml
# Incluído no docker-compose.yml gerado pelo lumi init
services:
  lumi-gateway:
    image: lumiplus/gateway:latest
    restart: always
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
```

---

## 6. Fluxo de uma Mensagem (WhatsApp → Agente → Resposta)

1. Usuário manda mensagem no WhatsApp
2. Baileys/provider dispara evento para o gateway
3. Gateway valida assinatura HMAC
4. Normaliza mensagem para formato interno `{ channel, sender_id, content, timestamp }`
5. Identifica agente pelo `channel_id` configurado
6. Verifica allowlist (se configurada)
7. Verifica horário de atendimento
8. Carrega memória curto prazo do Redis (contexto da conversa)
9. Carrega memória longo prazo do PostgreSQL (fatos sobre o contato)
10. Monta contexto completo (soul + memória + mensagem)
11. Envia para fila BullMQ com prioridade
12. Agent Runner consome da fila
13. Chama OpenRouter com fallback chain
14. Recebe resposta
15. Divide em chunks se necessário (limite de caracteres do canal)
16. Envia resposta pelo canal
17. Atualiza memória (curto prazo no Redis, longo prazo no PG se relevante)
18. Registra no audit log

---

## 7. Redundância Zero-Redis ("Resiliência Offline")

Para garantir que o Lumi Plus funcione em ambientes onde o Redis não pode ser instalado (ex: Windows local dev), implementamos um sistema de detecção ativa:

1. **Monitoramento**: A `redis.ts` verifica a conexão no startup.
2. **Fallback**: Se `isRedisAvailable` for falso, os serviços de fila (`WorkflowRunnerService`) ignoram o BullMQ.
3. **Execução In-Process**: As tarefas são enviadas diretamente para a função `processWorkflowRun`, que as executa de forma síncrona/em memória, garantindo que o fluxo não quebre.

---

## 8. Chunking de Respostas Longas

WhatsApp e Telegram têm limite de caracteres por mensagem. O sistema divide automaticamente:

- **WhatsApp:** máximo 4096 caracteres por mensagem
- **Telegram:** máximo 4096 caracteres por mensagem
- **Estratégia:** divide em parágrafos completos, nunca corta no meio de uma palavra
- **Delay entre chunks:** 500ms para parecer natural

---

## 8. Memória dos Agentes

### Curto Prazo (Redis / Banco)
- Chave: `session:{tenant_id}:{agent_id}:{contact_id}` ou `conversation_id` no DB.
- TTL: 30 minutos (configurável por agente) no Redis, persistente no banco (`ChannelMessage`).
- Conteúdo: últimas N mensagens da conversa isoladas por Agente.
- Resetado quando TTL expira ou usuário digita `/reset` (no painel, ao mudar de agente, o `conversationId` é resetado para criar contexto limpo).

### Longo Prazo (PostgreSQL)
- Tabela: `agent_memories`
- Campos: `tenant_id`, `agent_id`, `contact_id`, `key`, `value`, `updated_at`
- Exemplos: nome do contato, preferências, histórico de compras, tópicos relevantes
- Agente decide o que gravar após cada conversa

### Semântica (pgvector)
- Tabela: `agent_knowledge`
- Documentos divididos em chunks + embeddings
- Busca por similaridade no momento de responder
- Upload de PDF, TXT, MD pelo dashboard

---

## 9. Integração de IA — OpenRouter

```javascript
// Payload para OpenRouter com fallback nativo
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    models: [
      'openai/gpt-4o',
      'anthropic/claude-sonnet-4',
      'google/gemini-flash-1.5',
      'anthropic/claude-haiku-3'
    ],
    route: 'fallback',
    messages: context,
    max_tokens: 1000
  })
});
```

---

## 10. CI/CD Pipeline

```
Push para main
    → GitHub Actions
    → Testes automatizados (vitest)
    → Build Docker image
    → Push para registry
    → Deploy em staging
    → Smoke tests
    → Deploy em produção (se aprovado)
```

---

## 11. Observabilidade

- **Logs:** estruturados em JSON (`lib/logger.ts`), enviados para Loki
- **Métricas:** tokens por agente, latência, erros — Prometheus
- **Alertas:** threshold de custo por agente, taxa de erro > 5%
- **Tracing:** OpenTelemetry em todas as requisições
- **Health check:** `GET /health` retorna status de todos os serviços dependentes

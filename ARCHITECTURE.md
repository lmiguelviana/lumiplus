# Arquitetura do Sistema — Lumi Plus 🏗️

O **Lumi Plus** é uma plataforma multi-tenant para orquestração de Agentes de IA, projetada para escalabilidade, segurança e modularidade.

## 🏗️ Visão Geral da Pilha

### Backend (The Core)
- **Framework:** [Fastify](https://www.fastify.io/) (TypeScript)
- **Banco de Dados:** PostgreSQL + [Prisma ORM](https://www.prisma.io/)
- **Processamento:** BullMQ (Redis) com Fallback In-process ("Zero-Redis").
- **Observabilidade:** Logger centralizado (`lib/logger.ts`) e Error Handling padronizado.
- **Qualidade:** Testes automatizados com [Vitest](https://vitest.dev/).
- **Segurança:** RLS (Row Level Security) + AES-256 Vault para chaves de API.
- **IA Gateway:** Orquestração via OpenRouter (Chain de Fallbacks).

### Frontend (The Dashboard)
- **Framework:** [Next.js 15+](https://nextjs.org/) (App Router)
- **Design:** Tailwind CSS v4 + Framer Motion.
- **Ícones:** Lucide React.
- **Comunicação:** Axios + SWR/React Query.

### CLI (The Operator)
- **Nativo:** Node.js (Commander + Inquirer).
- **Função:** Bootstrap, configuração de banco e gerenciamento de deploys.

- **Workflow de Squads:** A tela “Workflows” no dashboard é o **Workflow de Squads** — único canvas de fluxos. O usuário usa **agentes já criados** e adiciona **trabalhadores** (cada um com contexto/soul individual). Se precisar, o fluxo notifica o humano via Telegram/WhatsApp. Sub-agentes (escritor, design) podem ter memória (arquivos .md, conhecimento RAG) e evoluir com o uso. Ver [docs/07_Visao_Workflow_Trabalhadores.md](docs/07_Visao_Workflow_Trabalhadores.md).

## 📁 Estrutura de Pastas

```bash
lumiplus/
├── backend/            # API Core, Services e Dados
│   ├── prisma/         # Schema e Migrations
│   ├── src/
│   │   ├── config/     # Env e Constantes
│   │   ├── routes/     # Endpoints (V1)
│   │   └── services/   # Lógica de IA, RAG e Bots
├── dashboard/          # Painel Web Pro (Next.js)
├── cli/                # Ferramenta de Linha de Comando
└── README.md           # Guia mestre
```

## 🔐 Camada de Segurança

1. **Multi-tenancy:** Todo dado é filtrado pelo `tenantId` no banco via RLS.
2. **Criptografia:** Chaves de API externas não são salvas em texto puro. O `VaultService` criptografa os dados antes da persistência.
3. **Auth:** Autenticação via JWT com contexto de tenant injetado em cada request.

## 🧠 Fluxo de Inteligência (RAG)

Quando um usuário envia uma mensagem:
1. O sistema gera um **Embedding** da pergunta.
2. Faz uma busca vetorial no `pgvector` para encontrar documentos relacionados.
3. Injeta o contexto no prompt e envia para o modelo mais estável via **OpenRouter Fallback Chain**.
## 💬 Comandos de Chat (Omnichannel)
O sistema suporta comandos de texto em todos os canais (Web Chat, WhatsApp, Telegram) para controle rápido:

- **Agentes:** `/agentes` (lista), `/usar <n>` (troca ativa), `/status` (quem sou eu?).
- **Squads:** `/squad lista`, `/squad info` (detalhes), `/squad exec <missão>`, `/squad memoria`.
- **Automação (Workflows):** `/run <nome_do_workflow>` (disparo remoto).
- **Utilidades:** `/skills` (lista ferramentas ativas), `/resetar` (limpa contexto), `/ajuda`.

---
*Documentação atualizada em 20/03/2026 às 09:15*

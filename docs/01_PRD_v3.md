# PRD v3.5 — Lumi Plus
**Product Requirements Document**
Versão: 3.5 | Status: MVP Consolidado → SaaS Growth

---

## 1. Visão do Produto

Lumi Plus é uma plataforma de orquestração de agentes de IA para pessoas, empresas e agências. O usuário monta visualmente times de agentes inteligentes (squads), cada um com personalidade, memória e acesso a ferramentas externas — tudo sem escrever código.

**Posicionamento:** OpenClaw + OpenSquad, mas para não-técnicos e para negócios. Interface visual drag-and-drop, app mobile, CLI e acesso via API. Roda em VPS, servidor próprio ou PC — sem lock-in de IDE ou cloud específica.

**Diferencial central:**
- Agente com soul (personalidade configurável), memória real (curto, longo prazo e semântica)
- Aprende com cada conversa e age autonomamente
- Configurável pelo próprio chat — sem abrir dashboard
- Troca de agente pelo WhatsApp/Telegram com um comando
- Busca na web com múltiplos providers e cache
- Resiliência Offline: Fallback automático Zero-Redis para ambientes Windows/Dev
- Pivô IA: Customização profunda (Alma, Skin, Mandato) por instância de agente na Squad
- Integração nativa com Meta (Facebook, Instagram, WhatsApp Business)
- Cron jobs nativos — agentes trabalham sozinhos em horários definidos
- Suporte a modelos locais via Ollama — 100% independente de APIs externas

---

## 2. Público-Alvo

### Persona principal: Empreendedor Estrategista
Dono de agência de marketing ou solopreneur. Quer escalar com IA sem contratar equipe. Orçamento restrito, alta exigência de resultado.

### Personas secundárias
- **Agência digital:** múltiplos workspaces, agentes por cliente
- **Empresa média:** atendimento, vendas e operações automatizadas
- **Developer power user:** CLI, API, self-hosted total, Ollama local

---

## 3. Conceitos Centrais

### Squad
Time de agentes colaborando. Dois modos:
- **Pipeline:** sequencial (A → B → C)
- **Rede livre:** qualquer agente chama outro

### Agente
Unidade autônoma com soul, memória e ferramentas.

### Soul
Personalidade do agente. Configurado uma vez, persiste para sempre. Imutável durante conversas.

### Agente Roteador
Agente especial do sistema que gerencia os outros pelo chat. Interpreta comandos `/` e roteia mensagens para o agente correto.

### Skill
Capacidade instalável: busca web, APIs, Meta, cron, geração de imagem, etc.

---

## 4. Features do MVP (v1.0)

### 4.1 Squad Builder Visual
- Canvas drag-and-drop com React Flow
- Modo pipeline e modo rede livre
- Status em tempo real (ativo, processando, erro)
- Salvar e publicar com um clique

### 4.2 Soul do Agente
- Wizard guiado: nome, missão, tom, regras
- System prompt gerado automaticamente
- Editável em modo avançado

### 4.3 Seleção de Agente pelo Chat
- Qualquer usuário usa `/agentes` para ver os disponíveis
- `/usar 2` troca para o agente selecionado
- Estado salvo no Redis (persiste 24h)
- Funciona em WhatsApp, Telegram e qualquer canal

### 4.4 Configuração pelo Chat
- Dono configura o agente diretamente no WhatsApp/Telegram
- `/config modelo gpt-4o`, `/config economia on`, `/config horario 8h-18h`
- `/config api facebook APP_ID TOKEN` — integra Meta sem abrir dashboard
- Segurança: valida se o remetente é o dono antes de executar

### 4.5 Memória Completa
- **Curto prazo:** Redis, TTL configurável
- **Longo prazo:** PostgreSQL, fatos por contato
- **Semântica:** pgvector + RAG com documentos
- Upload de PDF, TXT, MD, DOCX

### 4.6 Busca na Web (Múltiplos Providers)
- Brave Search API (gratuito, recomendado para protótipo)
- Perplexity via OpenRouter
- Tavily API
- Gemini Grounding (nativo se usar Gemini)
- Cache de 15 minutos no Redis
- Fallback automático entre providers

### 4.7 Canais MVP
- WhatsApp (Baileys — validado)
- Telegram (Bot API oficial)
- API REST com streaming SSE
- Chat web widget embutível
- Webhook de saída
- Múltiplas contas por canal (cada conta → agente diferente)

### 4.8 Integração Meta (v1.1)
- Instagram DM automático
- Facebook Messenger
- Publicação em páginas e Instagram
- Lead Ads — captura e processa leads automaticamente
- WhatsApp Business API oficial (migração de produção)

### 4.9 Multimodalidade (já implementado)
- Áudio via Whisper (Groq, <1s)
- Imagem via GPT-4o Vision
- Documento via extração de texto

### 4.10 Fallbacks de IA (5 níveis)
- OpenRouter gerencia níveis 1-4 nativamente
- Nível 5: resposta neutra + retry na fila

### 4.11 Economy Mode
- Troca automaticamente para modelos baratos (gpt-4o-mini, gemini-flash, haiku)
- Redução de custo de até 80%
- Ativável por agente via dashboard ou `/config economia on`

### 4.12 BYOK (Bring Your Own Key)
- Hierarquia: Agente > Workspace > Sistema global
- Cada tenant pode ter seu próprio faturamento isolado

### 4.13 Cron Jobs Nativos
- Agente executa tarefas em horários definidos
- Sem depender de serviço externo
- Via CLI: `lumi cron create "0 9 * * *" --agent sofia --task "..."`
- Via chat: `/config cron "todo dia 9h" resumo matinal`

### 4.14 Modelos Locais — Ollama (v1.1)
- Zero custo de API
- Dados 100% no servidor do usuário
- `lumi config set model "ollama/llama3.2" --local`

### 4.15 Dashboard Web
- Industrial UI "Ivory & Onyx" com dark mode
- Gestão de agentes, squads, canais
- Logs de interação em tempo real com tokens e latência
- Terminal de chat direto no dashboard
- Visualização de fallback chain e Economy Mode switch

### 4.16 CLI Completo
- `lumi init` — wizard de setup em <2 minutos
- `lumi doctor` — diagnóstico automático com `--fix`
- `lumi gateway` — daemon 24/7
- `lumi cron` — tarefas agendadas
- `lumi vault` — secrets criptografados
- Hot reload de config sem restart

### 4.17 Segurança
- RLS em todas as tabelas PostgreSQL
- Vault AES-256-GCM para API keys
- JWT com rotação de refresh token
- Rate limiting por usuário e agente
- Audit log append-only
- Proteção contra prompt injection

---

## 5. Arquiteto de Squad

Usuário descreve em linguagem natural, o sistema sugere o squad:

> "Quero um squad que pesquisa notícias, escreve posts para Instagram e agenda"

O Arquiteto sugere agentes, papéis e ordem. Usuário aprova antes de criar.

---

## 6. O que NÃO é o MVP v1.0

- Instagram DM e Meta completo (v1.1)
- Modelos locais Ollama (v1.1)
- Discord (v1.2)
- SMS (v1.2)
- Fine-tuning (futuro)
- Marketplace de agentes (v1.1)
- White-label (plano Agency)
- App mobile completo (v1.1)

---

## 7. Planos

### Agora: Free (Protótipo)
Acesso completo, sem limites, para validação.

### Futuro (feature flags já preparadas)
| Feature | Free | Starter R$97 | Pro R$297 | Agency R$897 |
|---------|------|-------------|-----------|-------------|
| Agentes | 3 | 10 | Ilimitado | Ilimitado |
| Workspaces | 1 | 1 | 3 | Ilimitado |
| Canais | 1 | 2 | Todos | Todos |
| Cron jobs | 1 | 5 | Ilimitado | Ilimitado |
| Memória semântica | — | — | Sim | Sim |
| Meta/Instagram | — | Sim | Sim | Sim |
| Ollama local | — | — | Sim | Sim |
| White-label | — | — | — | Sim |

---

## 8. Métricas de Sucesso

- `npm install` → agente respondendo: < 2 minutos
- Taxa de conclusão do wizard: > 80%
- Agentes ativos D7: > 50%
- Uptime: > 99.5%

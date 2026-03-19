# Fase 23 — Squad Evolutivo: Comunicação Inter-Agente & Auto-Aprendizado
Versão: 1.0 | Inspirado no OpenClaw (https://docs.openclaw.ai/)

---

## A Visão

Cada agente criado no Lumi Plus pode ser o **líder de uma ou várias squads**. A squad é um time de sub-agentes especialistas que colaboram, se comunicam e se auto-aperfeiçoam com o tempo.

```
┌─────────────────────────────────────────────────────────────┐
│  SQUAD: Time de Marketing Digital                           │
│                                                             │
│  🧠 LÍDER: Lumi Estrategista                               │
│     ↓ delega                                                │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │🔍 Pesqui- │→ │✅ Valida-│→ │✍️ Criador │→ │📢 Publi-│ │
│  │  sador   │   │   dor    │   │ de Post  │   │ cador   │ │
│  └──────────┘   └──────────┘   └──────────┘   └─────────┘ │
│                                                             │
│  ↻ Cada resultado é salvo na memória semântica da squad    │
└─────────────────────────────────────────────────────────────┘
```

O dono acessa o líder via **chat web, Telegram ou WhatsApp** — o líder coordena o resto.

---

## 1. Hierarquia da Squad

### Líder (Boss Agent)
- É um **Agent** existente no banco (`agents` table)
- Tem `agentType: "router"` — delega ao invés de responder diretamente
- Recebe o objetivo do usuário e distribui mandatos
- Consolida os resultados de todos os funcionários
- **O usuário fala só com o líder** — nunca diretamente com os funcionários

### Funcionários (Employee Agents)
- São sub-agentes especializados — cada um com sua `mission` e `soul`
- Podem ser criados do zero ou selecionados de agentes existentes
- Cada funcionário tem suas **skills** (ferramentas que pode usar):
  - `web_search` — pesquisa na internet em tempo real
  - `knowledge_search` — busca na memória semântica da squad
  - `scrape_url` — extrai conteúdo de uma URL
  - `write_memory` — salva aprendizado na base de conhecimento
  - `create_post` — publica conteúdo (futuro)
  - `call_api` — instala e chama APIs externas automaticamente

### Comunicação entre Funcionários
```
Líder → (tool call) → Pesquisador
Pesquisador → (resultado) → Líder
Líder → (tool call com contexto) → Validador
Validador → (resultado) → Líder
Líder → (tool call com contexto acumulado) → Criador de Post
Criador → (rascunho) → Líder
Líder → consolida e entrega ao usuário
```

---

## 2. Auto-Aprendizado Permanente

Inspirado no OpenClaw (SOUL.md / MEMORY.md / diários diários), cada squad mantém:

### 2a. Arquivo de Alma (SOUL.md)
```
/knowledge/squad-{id}/SOUL.md
```
- Personalidade, missão e regras da squad
- Pode ser **escrito pelo usuário** ou **enviado como arquivo .md** via dashboard
- Injetado no system prompt do líder em cada execução

### 2b. Diário de Execuções
Após cada execução de squad, o sistema salva automaticamente:
```
/knowledge/squad-{id}/execucao-{date}.md
```
Com:
- O objetivo pedido
- O que cada funcionário fez
- O que funcionou bem
- O que pode melhorar

### 2c. Memória Semântica (pgvector)
- Todo resultado de execução é **chunked e embedado** na tabela `agent_knowledge`
- Na próxima execução, o líder busca contexto relevante antes de delegar
- **Efeito**: a squad fica progressivamente mais precisa e contextualizada

### 2d. Aprendizado de Feedback
Quando o usuário avalia um resultado (👍/👎):
```typescript
// Novo campo em AgentInteraction
rating: "positive" | "negative"
// O rating alimenta a memória semântica:
// +1 → salva o exemplo como "bom" na knowledge base
// -1 → salva como "evitar" com tag negativa
```

---

## 3. Skills e Almas via Markdown

### Upload de SOUL.md pelo Dashboard
O usuário pode fazer upload de um arquivo `.md` na página do agente:

```
/agents/{id}/soul
→ POST /v1/agents/{id}/knowledge/soul
→ Salva como AgentKnowledge com title="SOUL" e chunkIndex=0
→ Injetado automaticamente em cada interação do agente
```

### Format do SOUL.md
```markdown
# Nome: Pesquisador Sênior

## Missão
Encontrar informações precisas e verificadas sobre qualquer tópico.

## Personalidade
Analítico, meticuloso, cita fontes sempre.

## Regras
- Sempre pesquise pelo menos 3 fontes antes de concluir
- Se a informação for conflitante, apresente os dois lados
- Prefira fontes primárias (sites oficiais, papers)

## Skills Ativas
- web_search: sim
- scrape_url: sim
- knowledge_search: sim
```

### Upload de AGENTS.md (configuração da squad)
```markdown
# Squad: Time de Marketing Digital

## Líder
Lumi Estrategista — define objetivos e consolida

## Funcionários
- **Pesquisador**: busca tendências, concorrentes, dados
- **Validador**: verifica fatos, consistência da marca
- **Criador**: gera o conteúdo criativo
- **Publicador**: formata e prepara para publicação

## Fluxo
Pesquisador → Validador → Criador → Publicador → Líder consolida

## Memória
Salvar: resultados aprovados, rejeições e motivos, padrões de sucesso
```

---

## 4. Auto-Instalação de APIs (Skills)

Agentes podem descobrir e instalar skills automaticamente via tool calling:

```typescript
// Tool disponível para agentes com permissão
{
  name: "install_skill",
  description: "Instala uma nova API/skill para uso futuro",
  parameters: {
    name: "string",        // ex: "consulta_cnpj"
    endpoint: "string",    // URL do webhook
    description: "string", // para o modelo saber quando usar
    inputSchema: "object"  // parâmetros esperados
  }
}
```

### Exemplos de Skills Auto-Instaláveis
- `consulta_cnpj` — consulta dados de empresa
- `cotacao_cambio` — cotação de moeda em tempo real
- `enviar_email` — via SendGrid/Resend
- `criar_imagem` — via DALL-E/Flux
- `agendar_post` — via Buffer/Hootsuite API

---

## 5. Acesso Multi-Canal pelo Usuário

O dono acessa o líder da squad através de qualquer canal configurado:

### WhatsApp / Telegram
```
Usuário → "Pesquise as últimas tendências em IA para meu post de amanhã"
Líder → delega para Pesquisador → Validador → Criador
Criador → retorna rascunho
Líder → "Aqui está o post pronto: [conteúdo completo]"
Usuário → 👍 ou "ajuste o tom para mais formal"
```

### Chat Web (Dashboard)
- Interface terminal estilo OpenClaw
- Visualiza o progresso em tempo real (qual funcionário está executando)
- Vê o canvas da squad sendo atualizado via LIVE_SYNC

### Comandos do Usuário
```
/squad usar [nome]          → ativa uma squad específica
/squad status               → mostra quem está executando o quê
/squad memoria              → mostra o que a squad aprendeu
/squad reset                → limpa contexto de sessão
/squad treinar [arquivo.md] → faz upload de SOUL.md ou AGENTS.md
```

---

## 6. Busca na Internet (Web Search)

Todos os funcionários com `web_search` ativado podem:
1. Pesquisar na Brave Search API (tempo real)
2. Fazer scraping de URLs específicas
3. Extrair conteúdo de PDFs públicos
4. Agregar múltiplas fontes em um contexto unificado

O resultado é **automaticamente salvo na memória semântica** se rating positivo.

---

## 7. Checklist de Implementação

### Backend
```
[x] GET /v1/knowledge/:agentId/soul — busca SOUL.md atual do agente ✅ 17/03/2026
[x] POST /v1/knowledge/:agentId/soul — salva SOUL.md do agente (upsert) ✅ 17/03/2026
[x] Injeção de SOUL.md no system prompt do AIService (1b. step) ✅ 17/03/2026
[x] Injeção de SOUL.md no SwarmService (líder da squad) ✅ 17/03/2026
[ ] POST /v1/squads/:id/knowledge/agents — upload de AGENTS.md
[x] Campo rating em AgentInteraction (migração Prisma) ✅ 17/03/2026
[ ] Tool install_skill na AIService
[x] Tool write_memory — salva aprendizado direto da execução ✅ 17/03/2026
[x] Tool scrape_url — extrai conteúdo de URLs ✅ 17/03/2026
[ ] Lógica de injeção do SOUL.md no system prompt do líder
[x] Auto-save de resultado de squad na AgentKnowledge (via KnowledgeService.save) ✅ 17/03/2026
[x] Endpoint GET /v1/squads/:id/memory — lista o que a squad aprendeu ✅ 17/03/2026
[x] Endpoint PATCH /v1/ai/interactions/:id/rating — feedback de interação ✅ 17/03/2026
[x] Modal de objetivo ao disparar squad (POST /squads/:id/trigger com objective) ✅ 17/03/2026
[x] Fix 500 no POST /squads/:id/canvas (sanitização JSON + bodyLimit 5MB) ✅ 17/03/2026
```

### Frontend
```
[x] Editor de SOUL.md na página de agentes — carrega, edita e salva inline ✅ 17/03/2026
[ ] Upload de AGENTS.md na página da squad (/workflows → aba Squads)
[ ] Visualização de progresso inter-agente no canvas (LIVE_SYNC por funcionário)
[x] Feedback 👍/👎 nas respostas do chat ✅ 17/03/2026
[x] Comandos /squad no chat web — /squad usar, lista, status, memoria, reset ✅ 17/03/2026
[x] Squad ativa no chat — mensagem vira objetivo, run dispara automaticamente ✅ 17/03/2026
[x] Badge squad ativa no header do chat (cor roxa, botão X para desativar) ✅ 17/03/2026
[x] Painel "O que minha squad aprendeu" — modal com lista de memórias, botão 🧠 na sidebar ✅ 17/03/2026
[x] Indicador visual de Líder no canvas — badge Crown amarela no AgentNode + borda dourada + nome no header da SquadNode ✅ 17/03/2026
[x] Modal de objetivo com textarea + Ctrl+Enter ao disparar squad ✅ 17/03/2026
```

### Canvas Squad Builder (melhorias UX — 17/03/2026)
```
[x] NodeResizer — arrastar bordas do nó Squad para redimensionar
[x] DeletableEdge — botão × na aresta selecionada + duplo clique para remover
[x] Handles maiores (w-4 h-4) + connectionRadius:40 — facilita conexão manual
[x] Funcionários sem auto-conexão — usuário conecta manualmente ao líder ou entre si
[x] Card simplificado dentro da squad — seletor de agente e label ocultos
[x] Fix race condition no auto-save (isLoadingRef) — canvas não sobrescreve ao trocar squad
[x] Edge deduplication — evita key warnings de arestas duplicadas
[x] Fix crash "Cannot read properties of undefined (reading 'x')" — nodes sanitizados ao carregar (position fallback em grid) ✅ 17/03/2026
[x] Fix KnowledgeService.save() — método ausente que causava crash silencioso na auto-memória ✅ 17/03/2026
[x] Fix worker squad — objetivo passado limpo (node.data.objective → payload.objective) + runId para WebSocket ✅ 17/03/2026
[x] Endpoint GET /v1/squads/:id/memory — lista memória semântica do líder da squad ✅ 17/03/2026
```

### Schema Prisma (nova migração)
```prisma
model AgentInteraction {
  // ... campos existentes
  rating String? // "positive" | "negative" | null
}

model SquadKnowledge {
  id       String @id @default(uuid())
  squadId  String @map("squad_id")
  tenantId String @map("tenant_id")
  title    String @default("Execução")
  content  String
  type     String @default("execution") // "soul" | "agents" | "execution" | "feedback"
  embedding Unsupported("vector(1536)")?
  createdAt DateTime @default(now()) @map("created_at")

  squad Squad @relation(fields: [squadId], references: [id])

  @@map("squad_knowledge")
}
```

---

## 8. Visão de Futuro (v1.2+)

- **Squad Marketplace**: templates de squads prontas (ex: "Time de Vendas", "Suporte ao Cliente")
- **Squad vs Squad**: dois times disputando a melhor solução, humano escolhe vencedor
- **Squad Autônoma**: executa tarefas agendadas sem intervenção humana
- **Self-improving loop**: a squad reescreve seu próprio SOUL.md com base nos aprendizados

---

## Referências de Inspiração

- **OpenClaw** (https://docs.openclaw.ai/): SOUL.md, MEMORY.md, diários diários, agent-to-agent
- **CrewAI**: papéis especializados por funcionário, fluxo sequencial/paralelo
- **AutoGen**: agentes conversam entre si com histórico compartilhado
- **LangChain**: ferramentas como skills modulares instaláveis

# Agent Spec — Lumi Plus
Versão: 3.5

---

## O que é um Agente

Um agente Lumi Plus é uma entidade autônoma com identidade, memória e capacidade de agir. Não é só um chatbot — é um colaborador digital que aprende, lembra e executa tarefas sozinho.

**Três pilares:**
1. **Soul** — quem ele é (personalidade, missão, limites)
2. **Memória** — o que ele sabe e lembra (curto prazo, longo prazo, semântica)
3. **Skills** — o que ele consegue fazer (ferramentas, APIs, canais)

---

## 1. Soul (Identidade do Agente)

O soul é configurado uma vez e define como o agente se comporta para sempre. Imutável durante a conversa.

### Campos do Soul

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `name` | Nome do agente | "Sofia" |
| `mission` | Por que ele existe | "Atender clientes com foco em conversão" |
| `tone` | Estilo de comunicação | "profissional", "informal", "empático", "técnico" |
| `personality` | Descrição livre | "Paciente, focada em soluções" |
| `rules` | Limites de comportamento | ["Nunca falar mal de concorrentes"] |
| `language` | Idioma padrão | "pt-BR" |

### System Prompt Gerado Automaticamente

```
[SYSTEM INSTRUCTIONS — IMMUTABLE]

Você é Sofia, assistente de atendimento ao cliente.

Missão: Atender clientes com foco em resolver problemas e aumentar conversão.

Personalidade: Paciente, focada em soluções, nunca encerra sem resolver.

Tom de voz: Profissional mas acessível. Use português brasileiro natural.

Regras que você SEMPRE segue:
- Sempre pergunte o nome do cliente no primeiro contato
- Nunca fale mal de concorrentes
- Se não souber responder, seja honesta e escale para um humano
- Máximo 3 parágrafos por resposta

[END SYSTEM INSTRUCTIONS]

[USER MESSAGE]
{mensagem do usuário}
[END USER MESSAGE]
```

Editável em modo avançado pelo dashboard.

---

## 2. Especialização em Squads (Pivô IA)

Na versão 3.5, introduzimos o conceito de **Especialização por Instância**. Isso permite que você arraste o mesmo Agente Base (ex: "Sofia") para uma Squad e dê a ela identidades diferentes em pontos diferentes do fluxo.

### Campos de Especialização (HUD do Canvas)

| Campo | Descrição | Impacto no Prompt |
|-------|-----------|------------------|
| **Soul (Alma)** | Temperamento momentâneo | "Aja com temperamento {soul}..." |
| **Skin (Pele)** | Aparência visual/estética | Altera o ícone/cor do nó no canvas |
| **Mandato (Role)** | Instruções específicas em Markdown | Substitui ou complementa a `mission` base |
| **Cérebro (Brain)** | Seleção de IA | Escolhe o modelo (GPT-4, Claude) para esta tarefa |

### AI Team Visual no Canvas

Cada nó de agente no canvas exibe seu **AI Team** — os modelos configurados para aquela instância:

```
┌─────────────────────────────────┐
│  SOFIA  [líder]                 │
│  Atendimento ao cliente         │
│                                 │
│  AI Team:                       │
│  🟢 gpt-4o (primary)           │
│  🔵 claude-sonnet (fallback 1)  │
│  🟡 gemini-flash (fallback 2)   │
│  🔴 gpt-4o-mini (economy)       │
└─────────────────────────────────┘
```

O AI Team pode ser editado **dentro do canvas** sem sair para o painel de agentes:
- Clique no nó → abre HUD lateral
- Seção "AI Team" lista os modelos na ordem de fallback
- Drag para reordenar prioridade
- Badge verde/vermelho indica se o modelo está disponível (key configurada)

```typescript
// Estrutura do AI Team por instância no canvas
interface AgentCanvasInstance {
  agentId: string;
  position: { x: number; y: number };
  soulOverride?: string;
  mandate?: string;
  // AI Team específico para esta posição no squad
  aiTeam?: {
    primary: string;        // ex: "openai/gpt-4o"
    fallbacks: string[];    // ex: ["anthropic/claude-sonnet-4", "google/gemini-flash-1.5"]
    economyModel?: string;  // ex: "openai/gpt-4o-mini"
  };
}
```

Se `aiTeam` não for configurado na instância, herda o AI Team do agente base.

### Composição de Prompt Sênior (Squad Mode)

Quando um agente roda dentro de uma Squad, o `System Prompt` final é composto dinamicamente:
1. `Base Soul Instructions` (do Agente original)
2. `Instance Mandate` (Markdown inserido no nó)
3. `Instance Soul Context` (Temperamento escolhido)
4. `Input Data` (Dados dos nós anteriores)

---

## 2. Agente Roteador (Tipo Especial)

O Agente Roteador é um agente especial que gerencia os outros pelo próprio chat. Existe um por workspace.

### Responsabilidades

- Interceptar comandos `/` antes de qualquer agente
- Gerenciar qual agente está ativo para cada contato
- Executar comandos de administração quando o remetente é o dono
- Exibir lista de agentes disponíveis

### Configuração Automática

Criado automaticamente no `lumi init`. Não precisa de configuração manual.

```typescript
// Agente roteador — identificado pelo tipo especial
const routerAgent = {
  type: 'router',
  name: 'Lumi Router',
  isSystem: true,
  handles: ['commands', 'routing', 'admin']
};
```

### Fluxo de Processamento

```
Mensagem recebida
  → É comando (começa com /) ?
    → Sim: CommandHandler.handle()
      → É comando admin E remetente é dono?
        → Sim: executa
        → Não: ignora silenciosamente
      → Retorna resposta do comando
    → Não: resolve agente ativo para o contato
      → Processa com o agente correto
```

---

## 3. Memória

### 3.1 Curto Prazo (Redis)

```
Chave: session:{tenant_id}:{agent_id}:{contact_id}
TTL: 30 minutos (configurável)
Conteúdo: últimas 20 mensagens
Reset: /resetar ou TTL expira
```

### 3.2 Longo Prazo (PostgreSQL)

Fatos permanentes sobre cada contato. O agente grava automaticamente ao final de cada conversa.

```json
{
  "tool": "update_memory",
  "contact_id": "uuid",
  "memories": [
    { "key": "nome_preferido", "value": "João", "confidence": 0.95 },
    { "key": "produto_interesse", "value": "Plano Pro", "confidence": 0.8 }
  ]
}
```

### 3.3 Semântica — Base de Conhecimento (pgvector)

```sql
SELECT content, 1 - (embedding <=> $query_embedding) AS similarity
FROM agent_knowledge
WHERE agent_id = $agent_id AND tenant_id = $tenant_id
ORDER BY similarity DESC
LIMIT 5;
```

Upload suportado: PDF, TXT, MD, DOCX

---

## 4. Busca na Web — Múltiplos Providers

O agente busca informações em tempo real quando necessário. Três providers configuráveis com fallback automático entre eles.

### Providers Disponíveis

| Provider | Custo | Tier gratuito | Melhor para |
|----------|-------|---------------|-------------|
| Brave Search API | Barato | 2.000 req/mês | Padrão — protótipo e produção |
| Perplexity Sonar (via OpenRouter) | Médio | Sem cartão necessário | Respostas com citações |
| Gemini Grounding | Incluído no Gemini | — | Se já usa Gemini como modelo |
| Tavily API | Médio | 1.000 req/mês | Dados estruturados / pesquisa profunda |

### Configuração

```env
# .env — defina pelo menos um provider
BRAVE_SEARCH_API_KEY=BSA_xxx      # recomendado para começar (grátis)
PERPLEXITY_API_KEY=pplx-xxx       # opcional
TAVILY_API_KEY=tvly-xxx           # opcional
```

Via comando no chat:
```
/config api busca brave BSA_xxx
```

### Lógica de Seleção e Fallback

```typescript
// src/services/WebSearchService.ts

const PROVIDER_PRIORITY = ['brave', 'perplexity', 'tavily', 'gemini'];

export class WebSearchService {
  async search(query: string, agentId: string): Promise<SearchResult[]> {
    // 1. Verifica cache (Redis, TTL 15 min)
    const cacheKey = `search:${Buffer.from(query).toString('base64').slice(0, 40)}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 2. Tenta providers na ordem de prioridade
    for (const provider of PROVIDER_PRIORITY) {
      const key = await this.getProviderKey(provider, agentId);
      if (!key) continue;

      try {
        const results = await this.callProvider(provider, query, key);
        await redis.set(cacheKey, JSON.stringify(results), { EX: 900 });
        return results;
      } catch (err) {
        logger.warn(`Busca falhou no provider ${provider}, tentando próximo`);
        continue;
      }
    }

    throw new Error('Nenhum provider de busca disponível');
  }

  private async callProvider(provider: string, query: string, key: string) {
    switch (provider) {
      case 'brave':
        return this.searchBrave(query, key);
      case 'perplexity':
        return this.searchPerplexity(query, key);
      case 'tavily':
        return this.searchTavily(query, key);
      case 'gemini':
        return this.searchGeminiGrounding(query, key);
    }
  }

  private async searchBrave(query: string, key: string) {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      { headers: { 'X-Subscription-Token': key } }
    );
    const data = await res.json();
    return data.web.results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description
    }));
  }
}
```

### Tool Use do Agente

```json
{
  "tool": "web_search",
  "query": "cotação do dólar hoje",
  "max_results": 3
}
```

---

## 5. Acesso a APIs Externas

### 5.1 APIs Configuradas pelo Dono

```json
{
  "name": "Consultar estoque",
  "method": "GET",
  "url": "https://meu-sistema.com/api/estoque/{produto_id}",
  "headers": { "Authorization": "Bearer {API_KEY}" },
  "description": "Consulta disponibilidade de produto"
}
```

```json
{ "tool": "api_call", "api_name": "Consultar estoque", "params": { "produto_id": "123" } }
```

### 5.2 Meta / Facebook (ver doc 09)

```json
{ "tool": "facebook_post", "page_id": "xxx", "message": "Novo post!", "image_url": "..." }
```

### 5.3 Webhook de Saída

```json
{ "tool": "send_webhook", "url": "https://crm.com/webhook", "event": "lead_qualificado", "data": {} }
```

---

## 6. Skills — Catálogo

### Skills MVP

| Skill | O que faz |
|-------|-----------|
| `web_search` | Busca na internet (Brave/Perplexity/Tavily/Gemini) |
| `api_call` | Chama APIs externas configuradas |
| `send_webhook` | Dispara webhooks para sistemas externos |
| `update_memory` | Grava/atualiza memória de longo prazo |
| `escalate_human` | Notifica dono e aguarda intervenção |
| `knowledge_search` | Busca RAG na base de conhecimento |
| `facebook_post` | Posta no Facebook/Instagram (requer doc 09) |
| `facebook_dm_reply` | Responde DMs do Instagram (requer doc 09) |

### Skills v1.1

| Skill | O que faz |
|-------|-----------|
| `image_generation` | Gera imagens via DALL-E ou Flux |
| `send_email` | Envia emails via SMTP/SendGrid |
| `schedule_message` | Agenda mensagens |
| `crm_integration` | HubSpot/Pipedrive |
| `cron_task` | Tarefas agendadas nativas |

---

## 7. Cron Jobs Nativos

O agente pode executar tarefas agendadas sem depender de serviço externo.

### Configuração

Via CLI:
```bash
lumi cron create "0 9 * * *" --agent sofia --task "resumo matinal"
lumi cron create "0 18 * * 5" --agent max --task "relatório semanal"
lumi cron list
lumi cron delete <id>
```

Via comando no chat:
```
/config cron "todo dia 9h" resumo das notícias do nicho
```

### Exemplos de Uso

```
Todo dia às 9h → Sofia busca notícias → envia resumo para grupo do Telegram
Toda segunda → Max gera relatório de performance → envia por email
A cada hora → Ana verifica novos leads no CRM → notifica dono se urgente
```

### Implementação

```typescript
// src/services/CronService.ts
import { Queue, Worker } from 'bullmq';
import cron from 'node-cron';

export class CronService {
  async create(agentId: string, schedule: string, task: string) {
    const cronJob = await prisma.agentCronJob.create({
      data: { agentId, schedule, task, enabled: true }
    });

    cron.schedule(schedule, async () => {
      await agentQueue.add('cron_task', {
        agentId,
        task,
        cronJobId: cronJob.id,
        triggeredBy: 'cron'
      });
    });

    return cronJob;
  }
}
```

---

## 8. Modelos Locais (Ollama) — v1.1

Para independência total — dados ficam 100% no servidor, zero custo de API.

```bash
# Instalar Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.2
ollama pull mistral

# Configurar no Lumi Plus
lumi config set model "ollama/llama3.2" --local
lumi config set ollama-url "http://localhost:11434"
```

```env
OLLAMA_BASE_URL=http://localhost:11434
```

O AIService detecta automaticamente se o modelo começa com `ollama/` e roteia para o endpoint local em vez do OpenRouter.

---

## 9. Fallbacks de IA (5 níveis)

```
Nível 1: Modelo primário (ex: gpt-4o)
    ↓ falha
Nível 2: Fallback OpenRouter 1 (ex: claude-sonnet-4)
    ↓ falha
Nível 3: Fallback OpenRouter 2 (ex: gemini-flash-1.5)
    ↓ falha
Nível 4: Modelo economia (ex: claude-haiku-3)
    ↓ todos falharam
Nível 5: Resposta neutra + retry na fila
```

---

## 10. Escalada para Humano

1. Agente responde: "Vou verificar isso e retorno em breve."
2. Cria registro em `escalations` com `status: pending`
3. Push notification para o dono
4. Dono assume pelo dashboard ou app
5. Resolvido → `status: resolved`

**Gatilhos:**
- 3 tentativas sem resposta satisfatória
- Palavras de frustração configuradas
- Skill `escalate_human` chamada explicitamente

---

## 11. Horário de Atendimento

```json
{
  "schedule_enabled": true,
  "schedule": {
    "timezone": "America/Sao_Paulo",
    "days": ["mon","tue","wed","thu","fri"],
    "hours": { "start": "08:00", "end": "18:00" }
  },
  "out_of_hours_message": "Retornamos amanhã às 8h. Deixe sua mensagem!"
}
```

Via chat: `/config horario 08:00-18:00`

---

## 12. Ciclo de Vida de uma Conversa

```
Mensagem recebida
  → É comando? → CommandHandler → resposta do comando
  → Resolve agente ativo para o contato
  → Verifica allowlist / blocklist
  → Verifica horário de atendimento
  → Carrega memória curto prazo (Redis)
  → Carrega memória longo prazo relevante (PG)
  → Busca knowledge base RAG se necessário
  → Monta contexto (soul + memória + mensagem)
  → Chama IA com fallback chain
  → Executa tools se necessário
  → Formata resposta (chunking)
  → Envia pelo canal
  → Atualiza memória curto prazo
  → (Async) Atualiza memória longo prazo
  → Registra no audit log
```

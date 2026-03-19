# Guia de Integrações — Lumi Plus
Versão: 3.0

---

## Princípios de Integração

- **Normalização:** toda mensagem de qualquer canal vira o formato interno `LumiMessage` antes de chegar ao agente
- **Comandos do sistema:** qualquer canal suporta comandos especiais `/` para gerenciar agentes sem abrir o dashboard
- **Chunking automático:** respostas longas são divididas automaticamente respeitando limites de cada canal
- **Validação de assinatura:** todos os webhooks de entrada são validados via HMAC
- **Sem lock-in:** a camada de canal é intercambiável — trocar de provider não afeta o agente

### Formato Interno (LumiMessage)

```typescript
interface LumiMessage {
  id: string;
  channel_type: 'whatsapp' | 'telegram' | 'api' | 'webchat' | 'webhook';
  channel_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  content_type: 'text' | 'audio' | 'image' | 'document';
  is_command: boolean;       // true se começa com /
  raw_payload: object;
  received_at: Date;
}
```

---

## 1. Comandos do Sistema (todos os canais)

Qualquer usuário com acesso ao agente pode usar comandos especiais. O dono do workspace tem acesso a comandos de administração adicionais.

### Comandos de Usuário (qualquer contato)

| Comando | O que faz |
|---------|-----------|
| `/start` | Saudação inicial e apresentação do agente |
| `/agentes` | Lista os agentes disponíveis no workspace |
| `/usar <número>` | Troca para o agente selecionado |
| `/resetar` | Limpa a memória de curto prazo (reinicia conversa) |
| `/status` | Mostra o agente ativo e informações básicas |
| `/ajuda` | Lista todos os comandos disponíveis |

**Exemplo de fluxo de seleção de agente:**

```
Usuário: /agentes

Sistema: Agentes disponíveis no seu workspace:

1️⃣ Sofia — Atendimento ao cliente
2️⃣ Max — Marketing e conteúdo
3️⃣ Ana — Análise de dados

Você está falando com: Sofia
Digite /usar 2 para trocar para Max

---

Usuário: /usar 2

Sistema: ✅ Conectado ao Max!

Max: Oi! Sou o Max, especialista em marketing
e criação de conteúdo. No que posso te ajudar?
```

### Comandos de Administração (somente dono do workspace)

O sistema verifica se o `sender_id` é o dono antes de executar. Se não for, ignora o comando silenciosamente.

| Comando | O que faz |
|---------|-----------|
| `/config modelo <model>` | Troca o modelo de IA do agente ativo |
| `/config economia on\|off` | Ativa/desativa modo economia |
| `/config horario <inicio>-<fim>` | Define horário de atendimento |
| `/config allowlist add <número>` | Adiciona número à allowlist |
| `/config allowlist remove <número>` | Remove número da allowlist |
| `/config api facebook <APP_ID> <TOKEN>` | Configura integração Meta |
| `/config api openrouter <KEY>` | Atualiza chave OpenRouter do agente |
| `/memoria` | Mostra o que o agente sabe sobre o contato atual |
| `/logs` | Últimas 5 interações do agente com métricas |
| `/pausar` | Pausa o agente (para de responder) |
| `/retomar` | Retoma o agente pausado |

**Exemplos:**

```
Dono: /config modelo google/gemini-flash-1.5
Sistema: ✅ Modelo atualizado para Gemini Flash. Custo reduzido ~70%.

Dono: /config horario 08:00-18:00
Sistema: ✅ Horário configurado: seg-sex, 8h às 18h (America/Sao_Paulo)

Dono: /memoria
Sistema: 📧 O que sei sobre João Silva:
• Nome preferido: João
• Interesse: Plano Pro
• Última compra: Curso de Marketing (jan/2025)
• Tom preferido: direto e objetivo
```

### Implementação do Handler de Comandos

```typescript
// src/services/CommandHandler.ts

const ADMIN_COMMANDS = ['/config', '/memoria', '/logs', '/pausar', '/retomar'];
const USER_COMMANDS = ['/start', '/agentes', '/usar', '/resetar', '/status', '/ajuda'];

export class CommandHandler {
  async handle(message: LumiMessage, agent: Agent, isOwner: boolean) {
    const [cmd, ...args] = message.content.trim().split(' ');

    // Comandos admin — verifica permissão
    if (ADMIN_COMMANDS.includes(cmd) && !isOwner) return null;

    switch (cmd) {
      case '/agentes':   return this.listAgents(message.channel_id);
      case '/usar':      return this.switchAgent(args[0], message);
      case '/resetar':   return this.resetMemory(agent, message.sender_id);
      case '/status':    return this.getStatus(agent);
      case '/config':    return this.handleConfig(args, agent);
      case '/memoria':   return this.getMemory(agent, message.sender_id);
      default:           return null; // não é comando — processa normalmente
    }
  }

  private async switchAgent(index: string, message: LumiMessage) {
    const agents = await agentService.listByChannel(message.channel_id);
    const selected = agents[parseInt(index) - 1];
    if (!selected) return 'Agente não encontrado. Use /agentes para ver a lista.';

    // Salva agente ativo na sessão do contato no Redis
    await redis.set(
      `active_agent:${message.channel_id}:${message.sender_id}`,
      selected.id,
      { EX: 86400 } // 24h
    );
    return `✅ Conectado ao ${selected.name}!`;
  }

  private async handleConfig(args: string[], agent: Agent) {
    const [scope, key, ...values] = args;
    const value = values.join(' ');

    if (scope === 'modelo') {
      await agentService.update(agent.id, { primaryModel: key });
      return `✅ Modelo atualizado para ${key}`;
    }
    if (scope === 'economia') {
      await agentService.update(agent.id, { economyMode: key === 'on' });
      return `✅ Modo economia ${key === 'on' ? 'ativado' : 'desativado'}`;
    }
    if (scope === 'api' && key === 'facebook') {
      const [appId, token] = value.split(' ');
      await apiKeyVault.store(agent.id, 'facebook', { appId, token });
      return '✅ Integração Facebook configurada com sucesso!';
    }
    return 'Configuração não reconhecida. Use /ajuda para ver os comandos.';
  }
}
```

---

## 2. WhatsApp

### Implementação

Usa **Baileys** — validado em produção. Suporta texto, áudio (Whisper), imagem (GPT-4o Vision) e documentos.

### Múltiplas Contas

O sistema suporta múltiplas contas WhatsApp, cada uma roteada para um agente diferente:

```typescript
// config/channels.ts
channels: {
  whatsapp: {
    accounts: {
      'atendimento': { agentId: 'agt_sofia', sessionPath: './sessions/wa-atendimento' },
      'marketing':   { agentId: 'agt_max',   sessionPath: './sessions/wa-marketing' },
      'pessoal':     { agentId: 'agt_pessoal', sessionPath: './sessions/wa-pessoal' }
    }
  }
}
```

### Setup via CLI

```bash
lumi channel add whatsapp
# Wizard: seleciona agente → exibe QR → usuário escaneia → salvo
```

### Chunking de Mensagens

```javascript
function chunkMessage(text, maxLength = 3800) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  const paragraphs = text.split('\n\n');
  let current = '';
  for (const para of paragraphs) {
    if ((current + para).length > maxLength) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
// Delay entre chunks: 600ms
```

### Reconexão Automática

```
Sessão cai → tenta reconectar (3x, intervalo: 5s / 15s / 45s)
→ Falha: notifica dono + entra em "aguardando reconexão"
→ Mensagens recebidas ficam na fila BullMQ
```

### Tipos de Mensagem Suportados

| Tipo | Status | Observação |
|------|--------|------------|
| Texto | ✅ MVP | Completo |
| Áudio | ✅ MVP | Whisper via Groq |
| Imagem | ✅ MVP | GPT-4o Vision |
| Documento | ✅ MVP | Extrai texto |
| Localização | 🔜 v1.2 | — |

---

## 3. Telegram

### Setup

```bash
# BotFather → /newbot → copia token
lumi channel add telegram --token "7812345678:AAF_xxx" --agent-id agt_xxx
```

### Múltiplas Contas

```typescript
channels: {
  telegram: {
    accounts: {
      'suporte': { token: 'TOKEN_1', agentId: 'agt_sofia' },
      'noticias': { token: 'TOKEN_2', agentId: 'agt_max' }
    }
  }
}
```

### Webhook

```javascript
// Registro
await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: 'POST',
  body: JSON.stringify({
    url: `${GATEWAY_URL}/webhooks/telegram/${channelId}`,
    secret_token: WEBHOOK_SECRET
  })
});

// Receber
app.post('/webhooks/telegram/:channelId', async (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== WEBHOOK_SECRET) return res.status(401).send();
  await processIncomingMessage('telegram', req.body);
  res.status(200).send('OK');
});
```

### Comandos registrados no BotFather

```
agentes - Ver agentes disponíveis
usar - Trocar de agente (/usar 1)
resetar - Limpar memória da conversa
status - Status do agente atual
ajuda - Lista de comandos
```

---

## 4. API REST

```
POST /v1/agents/:agent_id/chat
Authorization: Bearer sk-lumi-xxx
```

```json
{
  "message": "Qual o status do meu pedido?",
  "session_id": "user-123",
  "contact": { "id": "user-123", "name": "João" },
  "stream": false
}
```

**Response:**
```json
{
  "id": "msg_xxx",
  "content": "Seu pedido está em separação...",
  "model_used": "openai/gpt-4o",
  "tokens": { "input": 234, "output": 45 },
  "latency_ms": 1234,
  "fallback_level": 0
}
```

---

## 5. Chat Web (Widget)

```html
<script>
  window.LumiConfig = {
    agentId: 'agt_xxx',
    token: 'pk-lumi-xxx',
    position: 'bottom-right',
    theme: 'light'
  };
</script>
<script src="https://cdn.lumiplus.com/widget.js" async></script>
```

---

## 6. Webhooks de Saída

```json
{
  "name": "Notificar CRM",
  "url": "https://meu-crm.com/webhook/lumi",
  "secret": "hmac-secret",
  "events": ["lead_qualificado", "escalation_created", "conversation_closed"]
}
```

Header enviado: `X-Lumi-Signature: sha256=xxx`

---

## 7. Roteamento Multi-Agente por Canal

Um canal pode servir múltiplos agentes com roteamento inteligente:

```typescript
// Lógica de roteamento
async function resolveAgent(message: LumiMessage): Promise<Agent> {
  // 1. Verifica se o contato tem agente ativo salvo (via /usar)
  const activeAgentId = await redis.get(
    `active_agent:${message.channel_id}:${message.sender_id}`
  );
  if (activeAgentId) return agentService.findById(activeAgentId);

  // 2. Usa o agente padrão do canal
  const channel = await channelService.findByChannelId(message.channel_id);
  return agentService.findById(channel.defaultAgentId);
}
```

---

## 8. Roadmap de Canais

| Canal | Versão | Status |
|-------|--------|--------|
| WhatsApp (Baileys) | 1.0 | ✅ Ativo |
| Telegram Bot API | 1.0 | ✅ Ativo |
| API REST | 1.0 | ✅ Ativo |
| Chat web widget | 1.0 | ✅ Ativo |
| Webhook de saída | 1.0 | ✅ Ativo |
| Instagram DM (Meta) | 1.1 | 🔜 Ver doc 09 |
| Facebook Messenger | 1.1 | 🔜 Ver doc 09 |
| Discord | 1.2 | 🔜 Roadmap |
| SMS | 1.2 | 🔜 Roadmap |
| WhatsApp Business API oficial | Qualquer | Migração produção |

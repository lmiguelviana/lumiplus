# Fase 28: Suporte a Grupos — Bot Responde em Grupos WhatsApp/Telegram
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Permitir que o bot funcione **dentro de grupos** do WhatsApp e Telegram, respondendo quando mencionado ou quando a mensagem é direcionada a ele. Sessão isolada por grupo.

Hoje o bot só funciona em conversas diretas (DM). Com suporte a grupos:
- Bot num grupo de equipe: "@ Thulio, qual o status do projeto?"
- Bot num grupo de clientes: responde dúvidas frequentes
- Bot moderador: monitora e responde quando chamado

---

## 1. Comportamento em Grupos

### Regras de ativação

| Regra | Comportamento |
|-------|--------------|
| **Menção** (padrão) | Só responde quando mencionado: `@thulio` ou nome do bot |
| **Sempre** | Responde toda mensagem no grupo (cuidado com spam) |
| **Palavra-chave** | Responde quando mensagem contém gatilho: "ajuda", "bot" |
| **Reply** | Responde quando alguém responde a uma mensagem dele |

### Configuração por agente

```typescript
interface GroupConfig {
  enabled: boolean;              // permite o bot em grupos
  activationMode: 'mention' | 'always' | 'keyword' | 'reply';
  mentionPatterns?: string[];    // padrões além do @nome: ["thulio", "IA", "bot"]
  keywords?: string[];           // para modo keyword: ["ajuda", "suporte"]
  cooldownSeconds?: number;      // anti-spam: min segundos entre respostas no grupo
  maxHistoryPerGroup?: number;   // contexto: últimas N mensagens do grupo (padrão: 10)
}
```

---

## 2. Sessões por Grupo

Cada grupo tem sua própria sessão de conversa, isolada das DMs:

```
Sessão DM:     agent:{agentId}:dm:{senderId}
Sessão Grupo:  agent:{agentId}:group:{groupId}
```

O histórico do grupo inclui mensagens de todos os membros, mas o bot sabe quem enviou cada uma:

```typescript
{
  role: 'user',
  content: 'João: Qual o prazo de entrega?\n\nMaria: E o valor do frete?',
  // Bot responde às duas perguntas
}
```

---

## 3. WhatsApp — Grupos

### Detectar se é grupo

```typescript
// Em message-handler.ts
const isGroup = message.key.remoteJid?.endsWith('@g.us');
const senderId = message.key.participant; // quem enviou no grupo
const groupId = message.key.remoteJid;
```

### Verificar menção

```typescript
function shouldRespond(message: any, botName: string, config: GroupConfig): boolean {
  const text = message.message?.conversation
    || message.message?.extendedTextMessage?.text
    || '';

  if (config.activationMode === 'always') return true;

  if (config.activationMode === 'mention') {
    const patterns = [botName.toLowerCase(), ...(config.mentionPatterns || [])];
    return patterns.some(p => text.toLowerCase().includes(p));
  }

  if (config.activationMode === 'keyword') {
    return (config.keywords || []).some(k => text.toLowerCase().includes(k.toLowerCase()));
  }

  if (config.activationMode === 'reply') {
    // Verifica se é reply a uma mensagem do bot
    const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
    return quotedParticipant === botJid;
  }

  return false;
}
```

### Contexto do grupo

Manter últimas N mensagens do grupo para dar contexto:

```typescript
// Armazena em memória (Map) ou Redis
const groupHistory = new Map<string, Array<{ sender: string; text: string; timestamp: number }>>();

function addToGroupHistory(groupId: string, sender: string, text: string) {
  const history = groupHistory.get(groupId) || [];
  history.push({ sender, text, timestamp: Date.now() });
  // Mantém apenas últimas 10
  if (history.length > 10) history.shift();
  groupHistory.set(groupId, history);
}
```

---

## 4. Telegram — Grupos

### Privacy Mode

Por padrão, bots Telegram **não recebem mensagens** de grupos (privacy mode). Soluções:
1. Desabilitar via `/setprivacy` no BotFather → bot vê tudo
2. Ou: bot responde apenas quando mencionado (`@bot_username`)
3. Ou: tornar bot admin do grupo

### Detectar grupo

```typescript
if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
  // É grupo
  const groupId = msg.chat.id;
  const senderId = msg.from.id;
  const senderName = msg.from.first_name;
}
```

### Menção nativa

```typescript
// Telegram tem entities de menção
const isMentioned = msg.entities?.some(e =>
  e.type === 'mention' && msg.text?.substring(e.offset, e.offset + e.length) === `@${botUsername}`
);
```

---

## 5. Schema — Campos no Agent

```prisma
model Agent {
  // ... campos existentes ...

  groupEnabled       Boolean @default(false) @map("group_enabled")
  groupActivation    String  @default("mention") @map("group_activation") // mention, always, keyword, reply
  groupMentionPatterns String[] @map("group_mention_patterns")
  groupKeywords      String[] @map("group_keywords")
  groupCooldown      Int     @default(5) @map("group_cooldown") // segundos
  groupHistoryLimit  Int     @default(10) @map("group_history_limit")
}
```

---

## 6. UI — Configuração de Grupos no Agente

Na página de edição do agente, seção "Canais":

```
┌─────────────────────────────────────────────┐
│ 👥 COMPORTAMENTO EM GRUPOS                  │
│                                             │
│ ☑ Permitir bot em grupos                    │
│                                             │
│ Ativar quando:                              │
│ [▼ Mencionado (@nome)          ]            │
│                                             │
│ Padrões de menção (além do @nome):          │
│ [ thulio, ia, bot              ]            │
│                                             │
│ Cooldown entre respostas: [ 5 ] segundos    │
│ Histórico de contexto:   [ 10 ] mensagens   │
└─────────────────────────────────────────────┘
```

---

## 7. Checklist de Implementação

```
[x] Prisma: campos groupEnabled, groupActivation, groupMentionPatterns, groupKeywords, groupCooldown, groupHistoryLimit ✅ 18/03/2026
[x] WhatsApp handler: detecta @g.us, verifica menção/keyword/always/reply ✅ 18/03/2026
[x] Telegram handler: detecta group/supergroup, menção nativa + patterns ✅ 18/03/2026
[x] AccessControlService.shouldRespondInGroup() — lógica unificada ✅ 18/03/2026
[x] Cooldown anti-spam por grupo (Map em memória) ✅ 18/03/2026
[x] UI: seção "Comportamento em Grupos" no modal de edição do agente ✅ 18/03/2026
[x] PATCH /dashboard/agents aceita campos group_* ✅ 18/03/2026
```

---

## 8. Exemplo de Uso Real

```
[Grupo "Equipe Marketing" no WhatsApp]

João: Alguém sabe o prazo da campanha de natal?
Maria: Acho que é dia 20
João: @thulio confirma pra gente

Thulio (bot): Segundo meus registros, a campanha de natal
está programada para lançamento em 20/12 às 10h.
O material precisa ser aprovado até 18/12.
```

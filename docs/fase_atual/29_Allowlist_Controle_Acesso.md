# Fase 29: Allowlist & Controle de Acesso — Quem Pode Falar com o Bot
Versão: 1.0 | PRIORIDADE MÉDIA

---

## Visão

Controlar **quem pode interagir** com cada agente. Hoje qualquer pessoa que manda mensagem recebe resposta. O dono precisa decidir:
- Bot aberto (qualquer um fala)
- Bot fechado (só números autorizados)
- Blocklist (bloquear spammers)

---

## 1. Modos de Acesso

| Modo | Comportamento |
|------|--------------|
| `open` | Qualquer pessoa pode falar (padrão atual) |
| `allowlist` | Só números/IDs na lista branca |
| `pairing` | Primeira mensagem pede aprovação do dono |
| `disabled` | Bot não responde ninguém |

---

## 2. Schema

```prisma
model Agent {
  // ... campos existentes ...

  accessMode        String  @default("open") @map("access_mode") // open, allowlist, pairing, disabled
  accessAllowlist   String[] @map("access_allowlist") // números/IDs permitidos
  accessBlocklist   String[] @map("access_blocklist") // números/IDs bloqueados (sempre aplicado)
}

model AccessRequest {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  agentId     String   @map("agent_id")
  senderId    String   @map("sender_id") // número ou ID do remetente
  senderName  String?  @map("sender_name")
  channel     String   // whatsapp, telegram
  status      String   @default("pending") // pending, approved, rejected
  createdAt   DateTime @default(now()) @map("created_at")
  reviewedAt  DateTime? @map("reviewed_at")

  agent Agent @relation(fields: [agentId], references: [id])

  @@map("access_requests")
}
```

---

## 3. Fluxo de Verificação

```typescript
// No message-handler, ANTES de processar a mensagem:

async function checkAccess(agentId: string, senderId: string, channel: string): Promise<'allowed' | 'blocked' | 'pending'> {
  const agent = await getAgent(agentId);

  // 1. Blocklist sempre tem prioridade
  if (agent.accessBlocklist.includes(senderId)) return 'blocked';

  // 2. Modo open → sempre permitido
  if (agent.accessMode === 'open') return 'allowed';

  // 3. Modo disabled → sempre bloqueado
  if (agent.accessMode === 'disabled') return 'blocked';

  // 4. Modo allowlist → verifica lista
  if (agent.accessMode === 'allowlist') {
    return agent.accessAllowlist.includes(senderId) ? 'allowed' : 'blocked';
  }

  // 5. Modo pairing → cria request se não aprovado
  if (agent.accessMode === 'pairing') {
    const existing = await prisma.accessRequest.findFirst({
      where: { agentId, senderId, status: 'approved' }
    });
    if (existing) return 'allowed';

    // Cria pedido de acesso
    await prisma.accessRequest.upsert({
      where: { agentId_senderId: { agentId, senderId } },
      create: { tenantId: agent.tenantId, agentId, senderId, channel, status: 'pending' },
      update: {},
    });
    return 'pending';
  }

  return 'allowed';
}
```

### Mensagens automáticas

```typescript
if (access === 'blocked') {
  // Silêncio total — não responde nada
  return;
}

if (access === 'pending') {
  await sendMessage(senderId, '🔒 Seu acesso está pendente de aprovação. Aguarde.');
  // Notifica o dono via canal preferido
  return;
}
```

---

## 4. UI — Controle de Acesso no Agente

Na página de edição do agente:

```
┌─────────────────────────────────────────────┐
│ 🔒 CONTROLE DE ACESSO                       │
│                                             │
│ Modo de acesso:                             │
│ [▼ Aberto (qualquer pessoa)     ]           │
│                                             │
│ ── Lista de Bloqueio ──                     │
│ [ +5511999... ] [x]                         │
│ [ +5521888... ] [x]                         │
│ [+ Adicionar número]                        │
│                                             │
│ (Se modo = allowlist)                       │
│ ── Números Permitidos ──                    │
│ [ +5511777... ] [x]                         │
│ [+ Adicionar número]                        │
│                                             │
│ (Se modo = pairing)                         │
│ ── Pedidos Pendentes ──                     │
│ +5511666... - 18/03 14:30  [✓] [✗]         │
│ +5521555... - 18/03 15:10  [✓] [✗]         │
└─────────────────────────────────────────────┘
```

---

## 5. Dashboard — Gestão de Acessos

Página ou seção no painel com:
- Lista de todos os contatos que interagiram
- Status (aprovado, pendente, bloqueado)
- Botão aprovar/rejeitar em lote
- Filtro por canal (WhatsApp, Telegram)

---

## 6. Integração com Grupos (Fase 28)

Em grupos, o controle de acesso funciona assim:
- **Modo open**: bot responde qualquer membro do grupo
- **Modo allowlist**: bot só responde membros da lista, ignora outros
- **Blocklist**: membros bloqueados são ignorados mesmo em grupo

---

## 7. Checklist de Implementação

```
[x] Prisma: accessMode, accessAllowlist, accessBlocklist no Agent ✅ 18/03/2026
[x] Prisma: model AccessRequest (@@unique agentId+senderId) ✅ 18/03/2026
[x] AccessControlService.checkAccess() — open, allowlist, pairing, disabled ✅ 18/03/2026
[x] Integrado no WhatsApp handler (antes de processar mensagem) ✅ 18/03/2026
[x] Integrado no Telegram handler (antes de processar mensagem) ✅ 18/03/2026
[x] Mensagem "pendente" para pairing, silêncio total para blocked ✅ 18/03/2026
[x] UI: seção "Controle de Acesso" no modal de edição do agente ✅ 18/03/2026
[x] UI: textarea allowlist/blocklist com números por linha ✅ 18/03/2026
[x] API: GET /access-requests, POST approve/reject ✅ 18/03/2026
[x] PATCH /dashboard/agents aceita campos access_* ✅ 18/03/2026
[x] Blocklist respeitada em contexto de grupo ✅ 18/03/2026
```

---

## 8. Exemplo de Uso Real

```
Cenário: Bot de atendimento VIP — só clientes cadastrados

Configuração:
- Modo: allowlist
- Allowlist: ["+5511999...", "+5511888...", "+5521777..."]

Resultado:
- Cliente cadastrado manda "oi" → bot responde normalmente
- Número desconhecido manda "oi" → silêncio total (não responde)
- Número na blocklist manda spam → silêncio total

Cenário 2: Bot aberto com blocklist

Configuração:
- Modo: open
- Blocklist: ["+5511666..."] (spammer)

Resultado:
- Qualquer pessoa manda mensagem → bot responde
- Número bloqueado manda mensagem → silêncio
```

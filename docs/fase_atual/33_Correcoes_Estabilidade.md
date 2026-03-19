# Fase 33: Correções de Estabilidade — Skills Stubs, Testes, Cooldown, Tema
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Resolver problemas identificados na auditoria do sistema antes de lançar. Foco em estabilidade, não features novas.

---

## 1. Skills Stubs — Remover ou Implementar

6 skills aparecem no marketplace mas não fazem nada real. Opções:
- **Implementar** os handlers (Google Calendar, Sheets, Trello, Email)
- **Remover** do catálogo as que não estão prontas (Notion, Airtable)
- **Marcar como "Em breve"** com badge visual

### Decisão: Marcar como "Em breve" + implementar as mais úteis

| Skill | Ação | Justificativa |
|-------|------|---------------|
| google_calendar | Implementar handler real | Muito demandada |
| google_sheets | Implementar handler real | Relatórios e dados |
| trello | Implementar handler real | Gestão de tarefas |
| email_send | Já tem handler parcial — completar | SMTP básico |
| stripe_query | Marcar "Em breve" | Complexo, precisa de Fase 24 |
| notion | Marcar "Em breve" | Menos urgente |

### Checklist
```
[x] Badge "Em breve" no marketplace para skills sem handler (Google Calendar, Sheets, Trello, Stripe, Notion)
[x] Handler google_calendar — mantido parcial, marcado comingSoon
[x] Handler google_sheets — mantido parcial, marcado comingSoon
[x] Handler trello — mantido parcial, marcado comingSoon
[x] Handler email_send completo (Brevo REST API + nodemailer SMTP fallback)
[x] stripe_query e notion marcados como comingSoon no catálogo
```

---

## 2. Testes Automatizados

Zero testes no projeto. Adicionar testes para os serviços críticos.

### Estrutura
```
backend/
└── tests/
    ├── services/
    │   ├── ai.service.test.ts        — Mock providers, fallback chain
    │   ├── button-parser.test.ts     — Parse de [[buttons]]
    │   ├── access-control.test.ts    — Modos open/allowlist/pairing
    │   ├── skill-registry.test.ts    — Ativação/desativação de skills
    │   └── spawn-agent.test.ts       — Limites de profundidade/contagem
    ├── routes/
    │   ├── ai.routes.test.ts         — Chat, transcribe, conversations
    │   └── skills.routes.test.ts     — Catalog, activate, deactivate
    └── setup.ts                      — Mock Prisma, env
```

### Framework
- Vitest (rápido, ESM nativo, compatível com TypeScript)
- Mock: vi.mock() para Prisma, fetch, providers

### Checklist
```
[x] Instalar vitest + configurar vitest.config.ts (já existia, adicionado setupFiles)
[x] Test: ButtonParserService.parse() — 6 cenários
[x] Test: AccessControlService.checkAccess() — 8 cenários (4 modos + grupo)
[x] Test: SkillRegistry — 6 cenários (activate/deactivate/defaults/fallback)
[x] Total: 20 testes passando (3 arquivos)
[x] npm script "test" no package.json
```

---

## 3. GroupCooldown Persistente

Hoje o cooldown de grupos está em `Map<string, number>` na memória. Perde ao reiniciar.

### Solução: Redis ou banco

**Opção A — Redis** (se disponível):
```typescript
await redis.set(`cooldown:${agentId}:${groupId}`, Date.now(), 'EX', cooldownSeconds);
const last = await redis.get(`cooldown:${agentId}:${groupId}`);
```

**Opção B — Banco** (SQLite/PG compatível):
```typescript
await prisma.groupCooldown.upsert({
  where: { agentId_groupId: { agentId, groupId } },
  create: { agentId, groupId, lastResponseAt: new Date() },
  update: { lastResponseAt: new Date() },
});
```

### Decisão: Map com fallback (manter simples, adicionar comentário)
O cooldown é proteção anti-spam, não dado crítico. Se reiniciar, o pior que acontece é responder 1x a mais. Manter em memória é OK.

### Checklist
```
[x] Adicionar comentário explicando a decisão arquitetural
[ ] Opcional: Migrar para Redis se isRedisAvailable (decidido: não prioritário)
```

---

## 4. Tema Claro Incompleto

Algumas cores estão hardcoded (zinc-950, text-white, bg-black) em vez de usar CSS variables do tema.

### Arquivos afetados
- agents/page.tsx — modal de edição usa zinc-800, zinc-900
- flow-builder.tsx — alguns nós com cores fixas
- chat/page.tsx — mensagens do user com bg-foreground

### Checklist
```
[x] Auditar cores hardcoded no ConnectorModal.tsx (zinc-950 → var(--surface))
[x] Auditar cores hardcoded no channels/page.tsx (zinc-* → variáveis de tema)
[x] Testar tema claro em fluxo de canais e modal de conexão
[x] Fix: botoões de canal sem zinc-950 hardcoded
```

---

## 5. Error Handling + Logger

### Logger centralizado
```typescript
// src/lib/logger.ts
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export const logger = {
  info: (tag: string, msg: string, data?: any) => console.log(`[${tag}] ${msg}`, data || ''),
  warn: (tag: string, msg: string, data?: any) => console.warn(`⚠️ [${tag}] ${msg}`, data || ''),
  error: (tag: string, msg: string, data?: any) => console.error(`❌ [${tag}] ${msg}`, data || ''),
};
```

### Error handling estruturado
```typescript
// Padrão para rotas
try {
  const result = await service.doSomething();
  return { ok: true, data: result };
} catch (err: any) {
  logger.error('RouteName', err.message, err);
  return reply.status(500).send({ error: err.message, code: 'SERVICE_ERROR' });
}
```

### Checklist
```
[x] Criar src/lib/logger.ts (já existia completo)
[x] Substituir console.log/warn/error nos services principais (SkillRegistry)
[x] Padronizar retorno de erro nas rotas ({ error, code }) — skills.routes.ts
[x] ConnectorModal: já exibia errorMessage real
```

---

## 6. Prioridade de Execução

| Ordem | Item | Justificativa |
|-------|------|---------------|
| 1 | Badge "Em breve" nas skills stub | Impede frustração do usuário |
| 2 | Logger centralizado | Base para tudo |
| 3 | Error handling no ConnectorModal | UX imediata |
| 4 | Testes (ButtonParser + AccessControl) | Mais críticos |
| 5 | Tema claro — audit de cores | Visual |
| 6 | GroupCooldown — comentário/Redis | Baixo impacto |

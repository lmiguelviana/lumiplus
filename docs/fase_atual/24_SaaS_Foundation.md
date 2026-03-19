# Fase 24 — SaaS Foundation: Billing, Onboarding & Multi-Tenancy
Versão: 1.0

---

## A Visão

Transformar o Lumi Plus de ferramenta interna em produto SaaS comercializável. O foco é: registro público, planos com limites, cobrança via Stripe e onboarding guiado para novos clientes.

```
┌─────────────────────────────────────────────────────────┐
│  LANDING PAGE (público)                                  │
│  → Pricing / Features / CTA                             │
│  → Registro por email + senha                           │
│  → OAuth (Google)                                       │
└─────────────┬───────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────┐
│  ONBOARDING WIZARD                                       │
│  Step 1: Criar workspace (nome, logo)                   │
│  Step 2: Criar primeiro agente                          │
│  Step 3: Testar no chat                                 │
│  Step 4: Escolher plano (free / pro / enterprise)       │
└─────────────┬───────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────┐
│  DASHBOARD (autenticado)                                 │
│  → Middleware de quotas por plano                       │
│  → Stripe Customer Portal para upgrade/downgrade        │
│  → Admin panel para o dono do SaaS                      │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Planos & Billing

### Tabela `Plan`
```prisma
model Plan {
  id          String   @id @default(uuid())
  name        String   @unique // "free", "pro", "enterprise"
  displayName String   @map("display_name")
  price       Decimal  @default(0) // preço mensal em BRL
  currency    String   @default("BRL")

  // Limites
  maxAgents       Int @default(2)    @map("max_agents")
  maxSquads       Int @default(1)    @map("max_squads")
  maxTokensMonth  Int @default(50000) @map("max_tokens_month")
  maxKnowledgeMb  Int @default(50)   @map("max_knowledge_mb")
  maxChannels     Int @default(1)    @map("max_channels")

  // Features
  hasWebSearch    Boolean @default(false) @map("has_web_search")
  hasSoulUpload   Boolean @default(false) @map("has_soul_upload")
  hasSquadBuilder Boolean @default(false) @map("has_squad_builder")
  hasApiAccess    Boolean @default(false) @map("has_api_access")

  tenants Tenant[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("plans")
}
```

### Planos Iniciais

| Plano | Preço | Agentes | Squads | Tokens/mês | Knowledge | Canais |
|-------|-------|---------|--------|------------|-----------|--------|
| Free | R$0 | 2 | 1 | 50k | 50MB | 1 (web) |
| Pro | R$97/mês | 10 | 5 | 500k | 500MB | 3 |
| Enterprise | R$297/mês | Ilimitado | Ilimitado | 2M | 5GB | Ilimitado |

### Integração Stripe
```typescript
// Fluxo de pagamento
1. Usuário escolhe plano → cria Stripe Checkout Session
2. Stripe webhook → confirma pagamento → atualiza tenant.planId
3. Stripe Customer Portal → upgrade/downgrade/cancelar
4. Cron diário → verifica assinaturas expiradas → downgrade para free
```

---

## 2. Auth Melhorado

### Registro Público
```
POST /v1/auth/register
  → email, password, name
  → Cria Tenant + User
  → Envia email de verificação
  → Retorna JWT
```

### OAuth (Google)
```
GET /v1/auth/google → redirect para Google OAuth
GET /v1/auth/google/callback → cria/vincula usuário
```

### Verificação de Email
```
POST /v1/auth/verify-email → token do email → ativa conta
POST /v1/auth/forgot-password → envia link de reset
POST /v1/auth/reset-password → token + nova senha
```

---

## 3. Middleware de Quotas

```typescript
// quotaMiddleware.ts
async function checkQuota(tenantId: string, resource: string) {
  const tenant = await getTenantWithPlan(tenantId);
  const plan = tenant.plan;

  switch (resource) {
    case 'agent':
      const agentCount = await prisma.agent.count({ where: { tenantId } });
      if (agentCount >= plan.maxAgents) throw new QuotaExceededError('agents');
      break;
    case 'squad':
      const squadCount = await prisma.squad.count({ where: { tenantId } });
      if (squadCount >= plan.maxSquads) throw new QuotaExceededError('squads');
      break;
    case 'tokens':
      const usage = await getMonthlyTokenUsage(tenantId);
      if (usage >= plan.maxTokensMonth) throw new QuotaExceededError('tokens');
      break;
  }
}
```

---

## 4. Onboarding Wizard

### Fluxo (4 steps)
1. **Workspace** — nome do workspace, logo (upload opcional)
2. **Primeiro Agente** — nome, missão, modelo (com sugestões)
3. **Testar** — chat embutido para testar o agente
4. **Plano** — escolher Free (continuar grátis) ou Pro (checkout Stripe)

### Persistência
```typescript
// Tenant ganha campo onboardingStep
model Tenant {
  // ...
  onboardingStep Int @default(0) @map("onboarding_step") // 0-4
  onboardingCompleted Boolean @default(false) @map("onboarding_completed")
}
```

---

## 5. Landing Page

### Seções
1. **Hero** — título + subtítulo + CTA "Começar Grátis"
2. **Features** — grid com ícones (Agentes IA, Squads, Knowledge, Multi-canal)
3. **Pricing** — 3 cards de plano (Free, Pro, Enterprise)
4. **Demo** — vídeo ou GIF do dashboard
5. **FAQ** — perguntas frequentes
6. **Footer** — links, termos, privacidade

### Tech
- Next.js pages (não precisa de auth)
- Rota: `/` (landing) vs `/dashboard` (autenticado)
- SEO: meta tags, Open Graph, schema.org

---

## 6. Admin Panel (Dono do SaaS)

### Dashboard Admin
```
/admin
  → Total de tenants, MRR, churn
  → Lista de tenants com uso (agentes, tokens, plano)
  → Ações: suspender tenant, mudar plano, ver logs
```

### Métricas
- **MRR** (Monthly Recurring Revenue)
- **Churn rate** — tenants que cancelaram
- **Uso médio** — tokens/agentes por tenant
- **Conversão** — free → pro rate

---

## 7. Checklist de Implementação

### Backend
```
[ ] Model Plan no Prisma + seed com 3 planos
[ ] Campo planId no Tenant (FK → Plan)
[ ] Campo onboardingStep + onboardingCompleted no Tenant
[ ] POST /v1/auth/register — registro público
[ ] POST /v1/auth/verify-email — verificação
[ ] POST /v1/auth/forgot-password + reset-password
[ ] GET/POST /v1/auth/google — OAuth
[ ] Middleware checkQuota — valida limites antes de criar agente/squad/chamada IA
[ ] POST /v1/billing/checkout — cria Stripe Checkout Session
[ ] POST /v1/billing/portal — Stripe Customer Portal
[ ] POST /v1/billing/webhook — Stripe webhooks (payment_succeeded, subscription_deleted)
[ ] GET /v1/admin/tenants — lista tenants (admin only)
[ ] GET /v1/admin/metrics — MRR, churn, uso
[ ] Cron: verificar assinaturas expiradas
```

### Frontend
```
[ ] Landing page (/, /pricing, /features)
[ ] Página de registro (/register)
[ ] Página de login melhorada (/login)
[ ] Onboarding wizard (/onboarding — 4 steps)
[ ] Componente PlanBadge — mostra plano atual no sidebar
[ ] Modal de upgrade — quando atinge limite
[ ] Página /settings/billing — plano atual, portal Stripe, histórico
[ ] Página /admin — painel admin (só dono do SaaS)
[ ] Página /admin/tenants — lista e gerencia clientes
```

### Infraestrutura
```
[ ] Conta Stripe configurada (test + production keys)
[ ] Resend/SendGrid para emails transacionais
[ ] Variáveis de ambiente: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY
[ ] Google OAuth credentials (client_id, client_secret)
```

---

## 8. Segurança SaaS

- **Isolamento de dados**: todo query filtra por `tenantId` (já existe)
- **Rate limiting**: por tenant + por IP (fastify-rate-limit)
- **CORS**: só domínios autorizados
- **Helmet**: headers de segurança
- **Input validation**: Zod em todos os endpoints
- **Audit log**: quem fez o quê (futuro)

---

## 9. Visão de Futuro (Fase 25+)

- **Fase 25 — Produção & Segurança**: rate limiting avançado, audit log, backup automático, CDN, monitoramento
- **Fase 26 — Crescimento**: marketplace de templates de squads, API pública, white-label
- **Fase 27 — Escala**: horizontal scaling, Redis cluster, CDN global, multi-região

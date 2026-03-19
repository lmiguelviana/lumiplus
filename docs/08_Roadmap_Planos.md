# Roadmap e Planos — Lumi Plus
Versão: 2.0

---

## Fase Atual: Protótipo (Free)

**Objetivo:** validar o produto com usuários reais antes de cobrar.

**Acesso:** gratuito e completo. Sem limite de uso por enquanto.

**Banco:** Lumi Cloud gerenciado (Supabase).

**Foco:** fazer funcionar bem, coletar feedback, medir retenção.

---

## Estrutura de Feature Flags

Desde o dia 1, toda feature sensível a plano usa uma verificação:

```javascript
// Exemplo de uso
if (!hasFeature(tenant, 'semantic_memory')) {
  throw new PlanLimitError('Memória semântica disponível no plano Pro');
}

// Função de verificação
function hasFeature(tenant, feature) {
  const planFeatures = PLAN_FEATURES[tenant.plan_tier];
  return planFeatures.includes(feature);
}

// Mapa de features por plano
const PLAN_FEATURES = {
  free: [
    'agents_3', 'squads_2', 'channels_1',
    'whatsapp', 'telegram', 'api_rest',
    'memory_short', 'memory_long',
    'fallbacks_5', 'web_search'
  ],
  starter: [
    ...PLAN_FEATURES.free,
    'agents_10', 'squads_5', 'channels_2',
    'semantic_memory', 'custom_skills'
  ],
  pro: [
    ...PLAN_FEATURES.starter,
    'agents_unlimited', 'squads_unlimited',
    'channels_all', 'workspaces_3',
    'priority_support', 'advanced_analytics',
    'skills_premium', 'api_webhooks_advanced'
  ],
  agency: [
    ...PLAN_FEATURES.pro,
    'workspaces_unlimited',
    'white_label', 'custom_domain',
    'sla_support', 'onboarding_dedicated'
  ]
};
```

**Regra:** o código de cada feature deve ser escrito pensando que o gate de plano vai existir. Nunca assume que o usuário tem acesso — sempre verifica.

---

## Planos Futuros

### Free (Sempre Existirá)
Para experimentação e uso pessoal leve.

| Item | Limite |
|------|--------|
| Agentes | 3 |
| Squads | 2 |
| Canais | 1 |
| Workspaces | 1 |
| Memória curto/longo prazo | Sim |
| Memória semântica (RAG) | Não |
| Busca na web | Sim |
| Skills básicas | Sim |
| Skills premium | Não |
| Suporte | Comunidade |

---

### Starter — R$ 97/mês
Para solopreneurs e freelancers.

| Item | Limite |
|------|--------|
| Agentes | 10 |
| Squads | 5 |
| Canais | 2 |
| Workspaces | 1 |
| Memória semântica | Sim |
| Skills premium | Sim |
| Suporte | Email (48h) |

---

### Pro — R$ 297/mês
Para agências pequenas e equipes.

| Item | Limite |
|------|--------|
| Agentes | Ilimitado |
| Squads | Ilimitado |
| Canais | Todos |
| Workspaces | 3 |
| Analytics avançado | Sim |
| Priority support | Sim (24h) |
| API webhooks avançados | Sim |

---

### Agency — R$ 897/mês
Para agências maiores com múltiplos clientes.

| Item | Limite |
|------|--------|
| Workspaces | Ilimitado |
| White-label | Sim |
| Domínio customizado | Sim |
| Onboarding dedicado | Sim |
| SLA | 99.9% uptime garantido |
| Suporte | Prioritário (4h) |

---

## Roadmap de Versões

### v1.0 — MVP (atual)
- Squad builder drag-and-drop
- Soul e configuração de agente
- Memória curto e longo prazo
- WhatsApp (Baileys) + Telegram
- API REST + Chat web widget
- 5 fallbacks de IA via OpenRouter
- CLI completo com wizard
- 3 modos de banco (Cloud / Supabase / Self-hosted)
- Gateway daemon 24/7
- Busca na web
- Chamada de APIs externas
- [x] Dashboard web (Industrial UI + Chat Web)
- App mobile (básico)
- Notificações de escalada
- Segurança: RLS, vault, rate limiting, audit log

### v1.1 — Expansão de Canais e Skills (Em Progresso)
- [x] Orquestração via Comandos (Omnichannel Commands)
- [x] Injeção de Base de Conhecimento Master (Agente "Lumi Helper")
- [x] Suporte a áudio (Whisper) — Web Chat
- [x] Suporte a imagens (GPT-4 Vision) — Web Chat
- [x] Skill: envio de email (Brevo/SMTP)
- Discord (📋 Planejado)
- Skill: geração de imagem (DALL-E / Flux)
- Skill: agendamento de mensagem
- Templates de squad prontos
- Marketplace básico de agentes
- Analytics avançado de tokens e custo

### v1.2 — Crescimento
- Instagram DM
- SMS
- Skill: integração CRM (HubSpot, Pipedrive)
- Arquiteto de Squad (IA que cria squads a partir de descrição)
- Lumi no mobile com mais funcionalidades
- Billing e planos pagos ativados

### v2.0 — Plataforma
- White-label para Agency
- Fine-tuning de modelos customizados
- Marketplace completo de skills e agentes
- Integrações nativas (Slack, Notion, Google Workspace)
- SDK para desenvolvedores criarem skills

---

## Métricas de Decisão para Monetizar

Critérios para ativar os planos pagos:

1. **Retenção D7 > 40%** — usuários voltando após 7 dias
2. **Agentes ativos > 500** — produto sendo usado de verdade
3. **NPS > 40** — usuários satisfeitos
4. **Infraestrutura estável** — uptime > 99.5% por 30 dias consecutivos

Quando esses critérios forem atingidos, ativar os planos pagos é só mudar uma flag — toda a infraestrutura já estará pronta.

---

## Estratégia de Lançamento

### Fase 1: Protótipo Fechado (agora)
- Grupo seleto de early adopters
- Feedback intensivo
- Iterar rápido

### Fase 2: Beta Aberto
- Cadastro liberado
- Free para todos
- Comunidade Discord/WhatsApp de usuários

### Fase 3: Monetização
- Planos ativados
- Early adopters ganham desconto vitalício
- Programa de indicação

### Fase 4: Crescimento
- Marketing de conteúdo
- Casos de uso documentados
- Parceiros e integradores

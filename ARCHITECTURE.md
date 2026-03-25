# Arquitetura do Sistema

O Lumi Plus e organizado como um monorepo com backend, dashboard, CLI e documentacao. O backend concentra a orquestracao de IA, registro de skills, conhecimento, canais e automacoes.

## Camadas principais

### Backend

- Fastify + TypeScript
- Prisma para persistencia
- BullMQ ou fallback in-process para execucao assicrona
- Vault de credenciais por workspace
- Orquestracao de modelos via camada de providers

### Dashboard

- Next.js App Router
- Gestao de agentes, skills, settings, chat e workflows

### CLI

- Bootstrap e operacao local

## Fluxo de uma mensagem

1. A mensagem entra por web chat, canal externo ou API.
2. O backend identifica tenant, agente e conversa.
3. Se a mensagem parecer onboarding de API externa, o `ApiOnboardingService` tenta resolver isso primeiro.
4. O sistema monta contexto com historico, knowledge e instrucoes de skills.
5. O `AIService` seleciona providers/modelos e executa a chamada.
6. Se houver tool calls, o `SkillRegistry` executa as tools e o `AIService` faz o round-trip.
7. A resposta final e persistida e devolvida ao canal.

## APIs customizadas via chat

O sistema agora tem um caminho explicito para "instalar" APIs externas pela conversa.

- O onboarding salva credencial e documentacao.
- O agente recebe uma integracao `custom:<slug>`.
- O `SkillRegistry` gera uma tool `custom_api_<slug>`.
- `call_api` e as tools dinamicas resolvem placeholders como `{{minha_api_key}}`.

Isso reduz a dependencia de prompts longos e melhora a confiabilidade quando o usuario compartilha uma documentacao grande.

## Resiliencia do AIService

O `AIService` foi endurecido para cenarios comuns de falha:

- fallback entre providers
- filtro de providers mais compativeis quando existem mensagens `tool`
- `max_tokens` adaptativo
- retry quando a API informa credito insuficiente com um teto menor suportado

## Seguranca

- isolamento por `tenantId`
- credenciais criptografadas no workspace
- autenticacao via JWT
- settings de produto persistidos no banco; `.env` fica restrito a infraestrutura

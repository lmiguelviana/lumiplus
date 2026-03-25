# Lumi Plus

Plataforma multi-tenant para criar, operar e evoluir agentes de IA com chat web, canais externos, workflows, squads, knowledge hub e integracoes customizadas.

## Principais capacidades

- Multi-provider de IA com fallback entre OpenRouter, OpenAI-compatible, Anthropic, Gemini, DeepSeek, Moonshot e NVIDIA NIM
- Chat web, WhatsApp, Telegram e API
- Skills por agente com marketplace e ativacao dinamica
- Workflows e squads acionados pelo dashboard ou pela conversa
- Knowledge Hub com busca e memoria operacional
- Vault de credenciais por workspace
- Onboarding deterministico de APIs externas via chat

## Onboarding de APIs customizadas

Quando o usuario envia uma mensagem longa com documentacao, endpoint e token de uma API externa, o backend tenta registrar a integracao antes de depender do modelo:

1. salva a credencial no vault do workspace
2. salva a documentacao no Knowledge Hub
3. registra a integracao `custom:<slug>` no agente
4. expoe uma tool dinamica `custom_api_<slug>`

Depois disso, o agente pode reutilizar a API em mensagens futuras sem precisar "reinstalar" a integracao.

## Estrutura

```text
lumiplus/
  backend/     API Fastify + Prisma + Skills + Providers
  dashboard/   App Next.js
  cli/         Ferramenta de setup e operacao
  docs/        Documentacao funcional e historico por fase
```

## Documentacao

- [Arquitetura](./ARCHITECTURE.md)
- [Guia de Integracoes](./docs/07_Guia_Integracoes.md)
- [Configuracao de IAs e Settings](./docs/11_Configuracao_IAs_Settings.md)
- [Fases do projeto](./docs/fase_atual/README.md)

## Status atual

Fase 39 concluida em 24/03/2026:

- onboarding de APIs customizadas via chat
- tools dinamicas `custom_api_*`
- placeholders seguros para credenciais em `call_api`
- retry com `max_tokens` reduzido quando o provider reporta credito insuficiente
- backend validado com build e testes

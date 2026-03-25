# Configuracao de IAs e Settings

Principio central: `.env` e para infraestrutura. Configuracoes operacionais do workspace ficam no banco.

## O que fica no `.env`

Exemplos:

```env
DATABASE_URL=...
JWT_SECRET=...
VAULT_MASTER_KEY=...
PORT=3001
OPENROUTER_API_KEY=... # apenas fallback de infraestrutura
```

## O que fica em `workspace_settings`

Exemplos de chaves:

```text
openrouter_key
openai_key
anthropic_key
gemini_key
groq_key
moonshot_key
nvidia_nim_key
default_model
economy_mode
custom_ai_providers
```

Observacao importante:

- a chave oficial do workspace para OpenRouter e `openrouter_key`
- `OPENROUTER_API_KEY` continua como fallback no ambiente

## Fluxo de resolucao

O `SettingsService` consulta:

1. banco do workspace
2. fallback de ambiente quando aplicavel

## Multi-provider

O backend suporta:

- OpenRouter
- OpenAI-compatible
- Anthropic
- Gemini
- DeepSeek
- Moonshot
- NVIDIA NIM

## Resiliencia atual do AIService

- fallback sequencial entre providers/modelos
- filtro de providers mais compativeis para round-trip com tools
- `max_tokens` adaptativo
- retry quando o provider devolve teto menor por falta de credito

## APIs customizadas de produto

APIs nao-IA tambem podem ser salvas no workspace.

Quando o onboarding via chat detecta uma API externa:

- a credencial vai para `workspace_settings`
- a documentacao vai para o Knowledge Hub
- a integracao recebe `type: "custom_api"`
- o `SkillRegistry` expoe `custom_api_<slug>` e aceita placeholders em `call_api`

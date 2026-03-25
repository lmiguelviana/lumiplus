# Fase 39 concluida - Onboarding de APIs customizadas e estabilizacao

Status: Concluido  
Data: 24/03/2026

## Objetivo

Eliminar o comportamento em que o chat parecia travar quando o usuario colava uma documentacao grande de API e pedia para o sistema instalar a integracao.

## Problema anterior

- dependencia excessiva do modelo para interpretar docs longas
- uso improvisado de `call_api` sem transformar a API em capacidade reutilizavel
- falhas por credito insuficiente ou excesso de tokens pareciam travamento
- inconsistencias de settings, especialmente em torno da chave do OpenRouter

## O que foi implementado

### 1. Onboarding deterministico

Novo servico: `backend/src/services/api-onboarding.service.ts`

Quando a mensagem parece onboarding de API, o backend:

- extrai nome da API, endpoint/base URL e token quando possivel
- salva a credencial no vault do workspace
- salva a documentacao no Knowledge Hub
- registra uma integracao `custom:<slug>` no agente
- responde imediatamente confirmando o cadastro

### 2. Tool dinamica por API customizada

Arquivo principal: `backend/src/services/skills/registry.ts`

Cada integracao `custom:<slug>` gera uma tool `custom_api_<slug>` com suporte a:

- `method`
- `path`
- `url`
- `headers`
- `query`
- `body`

### 3. Placeholders de segredo

`call_api` e as tools dinamicas passaram a resolver placeholders como:

```json
{
  "headers": {
    "Authorization": "Bearer {{gerarthumbs_api_key}}"
  }
}
```

### 4. Endurecimento do AIService

Arquivo principal: `backend/src/services/ai.service.ts`

Melhorias aplicadas:

- onboarding executado antes da orquestracao pesada
- round-trip de tool calls corrigido
- filtro de providers mais compativeis quando existem mensagens `tool`
- `max_tokens` adaptativo
- retry automatico quando o provider reporta credito insuficiente e informa um teto suportado

### 5. Estabilizacao complementar

- `auth.routes.ts` atualizado para nao depender do cliente Prisma desatualizado em `passwordHash`
- correcao da chave oficial `openrouter_key`
- limpeza dos bloqueios de build em `button-parser.service.ts` e `escalation.service.ts`

## Resultado

- APIs externas agora podem virar integracoes reutilizaveis
- o agente ganha uma tool executavel, em vez de depender so de prompt
- o backend reduz os cenarios de erro silencioso
- build e testes do backend ficaram verdes

## Validacao

- `npm run build`
- `npm test`

Suite validada com 26 testes passando no backend.

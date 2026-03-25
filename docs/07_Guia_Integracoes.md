# Guia de Integracoes

Este guia descreve como o Lumi Plus conversa com canais e APIs externas, com foco no fluxo atual de integracoes customizadas via chat.

## Canais suportados

- Chat web
- WhatsApp
- Telegram
- API REST

Todos os canais convergem para um fluxo interno comum de mensagem, historico, IA e skills.

## APIs customizadas via chat

Quando uma API ainda nao existe no catalogo de skills, o usuario pode enviar a documentacao diretamente na conversa.

### O que o sistema procura

- frase de intencao como "instale essa API" ou "configure essa API"
- endpoint ou base URL
- token, bearer token ou chave
- descricao de acoes disponiveis

### O que o backend faz

1. salva a credencial no vault do workspace
2. salva a documentacao no Knowledge Hub
3. cria ou atualiza a integracao `custom:<slug>` no agente
4. expoe a tool `custom_api_<slug>`

### Exemplo de chamada da tool dinamica

```json
{
  "method": "POST",
  "path": "/functions/v1/admin-api-gateway",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "action": "list_gallery"
  }
}
```

### Placeholders de credenciais

As credenciais podem ser referenciadas sem expor o segredo:

```json
{
  "url": "https://api.exemplo.com/run",
  "headers": {
    "Authorization": "Bearer {{api_exemplo_key}}"
  }
}
```

O backend resolve o placeholder no momento da execucao.

## Erros operacionais esperados

### Erro de protocolo no chat

Mensagens como `ERRO DE PROTOCOLO` indicam falha na comunicacao entre frontend e nucleo do backend. As causas mais comuns sao:

- provider sem credito
- falha na execucao de tool
- timeout interno
- payload invalido na chamada da API customizada

### Credito insuficiente no provider

Quando o provider retorna algo como "can only afford N", o `AIService` tenta repetir a chamada com `max_tokens` menor antes de esgotar o fallback.

## Boas praticas para cadastrar uma API

- incluir endpoint/base URL
- incluir token ou formato de autenticacao
- listar acoes suportadas
- mostrar um exemplo de request
- evitar colar documentacao irrelevante demais na mesma mensagem

# Guia de Integracoes

Este guia descreve como o Lumi Plus conversa com canais e APIs externas, com foco no fluxo atual de integracoes customizadas via chat.

## Canais suportados

- Chat web
- WhatsApp
- Telegram
- API REST

Todos os canais convergem para um fluxo interno comum de mensagem, historico, IA e skills.

## Skills nativas de WhatsApp via API

Quando a integracao ja existe no catalogo, o usuario nao precisa cadastrar como API customizada.

### Evolution API v2.3

Skill nativa: `evolution_api_v2`

Operacoes expostas atualmente:

- `create_instance`
- `connect_instance`
- `get_connection_state`
- `send_text`
- `send_media`
- `send_group_text`
- `send_group_media`
- `validate_numbers`
- `create_group`
- `list_groups`
- `get_group_info`
- `get_group_participants`
- `get_group_invite_code`
- `get_group_invite_info`
- `send_group_invite`
- `update_group_participants`
- `update_group_setting`
- `update_group_subject`
- `update_group_description`
- `leave_group`
- `configure_webhook`
- `configure_chatwoot`
- `configure_typebot`

Credenciais esperadas no workspace:

- `evolution_api_url`
- `evolution_global_key`
- `evolution_api_key`
- `evolution_instance`

Configuracao operacional:

- pode ser feita na pagina `/settings`
- tambem pode ser feita no modal de ativacao da skill em `/skills`
- quando a credencial ja existir no workspace, o modal reaproveita a configuracao atual e so exige novo preenchimento para sobrescrita

Notas sobre grupos:

- para operacoes de grupo, use `group_jid` no formato `999999999999999999@g.us`
- `send_group_text` e `send_group_media` deixam explicito o envio para grupo e evitam ambiguidade com envio para numero individual
- a leitura estrutural do grupo e nativa: lista, info, participantes, convites e configuracoes
- para analisar mensagens reais trocadas dentro do grupo, o Lumi precisa receber eventos da Evolution via webhook ou fluxo equivalente

### evoGo v3

Skill nativa: `evogo_api`

Operacoes expostas atualmente:

- `create_instance`
- `connect_instance`
- `get_status`
- `send_text`
- `send_media`
- `send_poll`
- `create_group`
- `list_groups`
- `check_numbers`
- `get_contacts`
- `set_webhook`
- `get_logs`

Credenciais esperadas no workspace:

- `evogo_api_url`
- `evogo_global_key`
- `evogo_api_key`
- `evogo_instance`

Configuracao operacional:

- pode ser feita na pagina `/settings`
- tambem pode ser feita no modal de ativacao da skill em `/skills`
- quando a credencial ja existir no workspace, o modal reaproveita a configuracao atual e so exige novo preenchimento para sobrescrita

### Quando usar skill nativa vs API customizada

Use a skill nativa quando:

- a operacao ja estiver coberta pelo catalogo
- o usuario quer uma experiencia mais segura e previsivel
- a API exige chaves administrativas e de instancia com semantica conhecida

Use onboarding de API customizada quando:

- a API nao existe no catalogo ainda
- o fluxo for muito especifico do cliente
- a documentacao precisar virar tool dinamica `custom_api_*`

## Skills nativas de SEO e Meta Ads

Quando o caso de uso ja esta no catalogo, o usuario nao precisa instalar como API customizada.

### Meta Tags Optimizer

Skill nativa: `meta_tags_optimizer`

Objetivo:

- gerar `title`
- gerar `meta description`
- sugerir `Open Graph`
- sugerir `Twitter Cards`
- produzir um bloco HTML pronto para copiar para a pagina

Entradas mais importantes:

- `primary_keyword`
- `url` opcional para leitura das tags atuais
- `secondary_keywords`
- `target_audience`
- `primary_cta`
- `unique_value_prop`
- `brand_name`
- `og_image_url`
- `canonical_url`

Comportamento operacional:

- se a `url` for informada, a skill tenta ler o HTML e extrair tags atuais
- se nao houver URL, a geracao acontece com base no briefing textual
- a resposta volta com sugestoes de title, description e um bloco `<head>` enxuto

### Meta Ads

Skills nativas:

- `meta_ads_read`
- `meta_ads_manage`

Credenciais esperadas no workspace:

- `meta_access_token`
- `meta_ad_account_id`

#### `meta_ads_read`

Uso recomendado:

- auditoria de conta
- listagem de campanhas, adsets e ads
- leitura de insights e metricas

Operacoes expostas atualmente:

- `get_account`
- `list_campaigns`
- `get_campaign`
- `list_adsets`
- `get_adset`
- `list_ads`
- `get_ad`
- `get_insights`

#### `meta_ads_manage`

Uso recomendado:

- criar campanha em estado controlado
- atualizar campanha
- pausar ou reativar campanha
- criar ou atualizar adset

Operacoes expostas atualmente:

- `create_campaign`
- `update_campaign`
- `set_campaign_status`
- `create_adset`
- `update_adset`
- `set_adset_status`

Guardrails atuais:

- a skill exige `confirm=true` para qualquer mutacao
- nao ha `delete`
- ainda nao ha criacao de criativo nem criacao do anuncio final
- a recomendacao e usar `meta_ads_read` primeiro e so depois aplicar mudancas com `meta_ads_manage`

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

## Boas praticas para Evolution API e evoGo

- configure a `base URL` apenas para servidores confiaveis
- guarde `global keys` no vault e use `instance keys` para mensageria
- valide numeros antes de disparos em massa
- use delays entre mensagens para reduzir risco operacional no WhatsApp
- confirme com o usuario antes de chamadas que alteram estado, como criar instancia, grupo ou webhook
- ao trabalhar com grupos na Evolution, prefira sempre o `group_jid` completo com `@g.us`

## Boas praticas para Meta Ads

- mantenha `meta_access_token` no vault do workspace
- salve `meta_ad_account_id` no workspace para evitar prompts repetidos
- use `meta_ads_read` para diagnostico antes de qualquer alteracao
- em alteracoes de campanha e adset, confirme escopo, status e budget com o usuario
- trate `meta_ads_manage` como operacao sensivel a gasto real

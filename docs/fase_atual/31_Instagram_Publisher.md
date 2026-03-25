# Fase 31: Instagram Publisher - Publicacao Automatica no Instagram
Versao: 1.1 | PRIORIDADE ALTA | IMPLEMENTACAO PARCIAL

---

## Visao

Permitir que agentes publiquem conteudo no Instagram automaticamente: posts unicos, carrosseis e stories. O agente cria o conteudo e publica via Instagram Graph API.

Casos de uso:
- Agente de Marketing cria e publica posts diarios
- Squad de conteudo: Pesquisador -> Redator -> Designer -> Publisher
- CronJob: "Toda segunda as 9h, publique uma dica do dia"
- Chat: "Publica um carrossel sobre as 5 tendencias de 2026"

### Status Atual

Ja implementado no codigo:
- skill `instagram_publish` no catalogo de skills
- skill `upload_image` com upload via ImgBB
- suporte inicial a `post`, `carousel` e `story`
- carregamento automatico das credenciais do workspace no runtime da skill
- credenciais na tela de Settings: `instagram_access_token`, `instagram_user_id`, `imgbb_api_key`
- ativacao por padrao para novos agentes

Ainda pendente:
- testes automatizados da integracao
- validacao E2E com conta real da Meta
- UX guiada para configurar credenciais direto pelo marketplace

---

## 1. Pre-requisitos

### Instagram Graph API
- Conta Business ou Creator no Instagram
- Facebook App configurada com permissoes `instagram_basic`, `instagram_content_publish`
- Access Token de longa duracao (60 dias, renovavel)

### Fluxo de autenticacao

```text
1. Usuario cria App no Facebook Developers
2. Configura permissoes Instagram
3. Gera token via Graph API Explorer
4. Cola o token na pagina Config do LumiPlus
```

---

## 2. Skill: instagram_publish

### Tool Definition

```typescript
{
  name: 'instagram_publish',
  description: 'Publica um post, carrossel ou story no Instagram',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['post', 'carousel', 'story'] },
      caption: { type: 'string' },
      image_urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'URLs publicas das imagens'
      },
    },
    required: ['type', 'caption', 'image_urls'],
  },
}
```

### Handler de referencia

```typescript
async function handleInstagramPublish(args: any, ctx: SkillContext) {
  const accessToken = ctx.credentials.instagram_access_token;
  const userId = ctx.credentials.instagram_user_id;
  if (!accessToken || !userId) return 'Credenciais do Instagram nao configuradas.';

  const { type, caption, image_urls } = args;
  const baseUrl = 'https://graph.facebook.com/v21.0';

  async function graphRequest(path: string, payload: Record<string, string>) {
    const body = new URLSearchParams(payload);
    const res = await fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.json();
  }

  if (type === 'story') {
    const createRes = await graphRequest(`${userId}/media`, {
      media_type: 'STORIES',
      image_url: image_urls[0],
      access_token: accessToken,
    });

    const publishRes = await graphRequest(`${userId}/media_publish`, {
      creation_id: createRes.id,
      access_token: accessToken,
    });

    return `Story publicada com sucesso! ID: ${publishRes.id}`;
  }

  if (type === 'post') {
    const createRes = await graphRequest(`${userId}/media`, {
      image_url: image_urls[0],
      caption,
      access_token: accessToken,
    });

    const publishRes = await graphRequest(`${userId}/media_publish`, {
      creation_id: createRes.id,
      access_token: accessToken,
    });

    return `Post publicado com sucesso! ID: ${publishRes.id}`;
  }

  if (type === 'carousel') {
    const containerIds = [];
    for (const url of image_urls.slice(0, 10)) {
      const mediaRes = await graphRequest(`${userId}/media`, {
        image_url: url,
        is_carousel_item: 'true',
        access_token: accessToken,
      });
      containerIds.push(mediaRes.id);
    }

    const carouselRes = await graphRequest(`${userId}/media`, {
      media_type: 'CAROUSEL',
      children: containerIds.join(','),
      caption,
      access_token: accessToken,
    });

    const publishRes = await graphRequest(`${userId}/media_publish`, {
      creation_id: carouselRes.id,
      access_token: accessToken,
    });

    return `Carrossel publicado com sucesso! ID: ${publishRes.id}`;
  }

  return `Tipo "${type}" nao suportado.`;
}
```

### Observacoes de implementacao atual

- O runtime atual busca as credenciais automaticamente do workspace antes de executar a skill.
- `story` foi implementado em modo inicial, com 1 imagem por publicacao.
- `upload_image` usa ImgBB e retorna URL publica para encadear com `instagram_publish`.
- As duas skills foram marcadas como default skills para novos agentes.

---

## 3. Credenciais

| Chave | Label | Obrigatoria |
|-------|-------|-------------|
| `instagram_access_token` | Instagram Access Token | Sim |
| `instagram_user_id` | Instagram User ID | Sim |
| `imgbb_api_key` | ImgBB API Key | Opcional |

### Upload de imagens

A Graph API do Instagram precisa de URLs publicas das imagens. Opcoes:
1. ImgBB - upload gratuito via API, retorna URL publica
2. Cloudinary - upload + transformacao
3. S3/R2 - storage proprio

Skill auxiliar `upload_image`:

```typescript
{
  name: 'upload_image',
  description: 'Faz upload de uma imagem e retorna URL publica',
  parameters: {
    type: 'object',
    properties: {
      image_base64: { type: 'string' },
      filename: { type: 'string' },
    },
    required: ['image_base64'],
  },
}
```

---

## 4. Instagram como Canal de DM (futuro)

Alem de publicar, o Instagram pode ser um canal de atendimento:
- Bot responde DMs do Instagram automaticamente
- Usa a mesma arquitetura de `ChannelManager`
- Instagram Messaging API via webhook

Isso continua sendo uma evolucao separada: primeiro publicacao, depois DMs.

---

## 5. Fluxo Completo com Squad

```text
[Squad "Social Media"]

Pesquisador (web_search) -> pesquisa tendencias do dia
    ->
Redator (knowledge_search) -> escreve legenda otimizada
    ->
Designer (image_creator) -> gera imagem do post
    ->
Publisher (instagram_publish) -> publica no Instagram

CronJob: Todo dia as 9h
```

---

## 6. Checklist de Implementacao

```text
[x] Skill instagram_publish no catalogo
[x] Handler com Instagram Graph API v21.0
[x] Skill upload_image (ImgBB)
[x] Credenciais: instagram_access_token, instagram_user_id, imgbb_api_key
[x] Instrucao no system prompt para uso correto
[x] Suporte inicial a story (1 imagem)
[x] Ativacao padrao para novos agentes
[ ] Testar: post unico com imagem em conta real
[ ] Testar: carrossel com 3+ imagens em conta real
[x] Documentar fluxo de autenticacao para o usuario
```

---

## 7. Proximos Passos

- validar `post`, `carousel` e `story` com uma conta real da Meta
- adicionar testes automatizados do handler
- considerar agendamento orientado a publicacao social na Fase 32
- evoluir a UX para salvar credenciais pela tela de marketplace, alem da tela Settings

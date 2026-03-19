# Fase 31: Instagram Publisher — Publicação Automática no Instagram
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Permitir que agentes **publiquem conteúdo no Instagram** automaticamente — posts únicos, carrosséis e stories. O agente cria o conteúdo (texto + imagens) e publica via Instagram Graph API.

Casos de uso:
- Agente de Marketing cria e publica posts diários
- Squad de conteúdo: Pesquisador → Redator → Designer → Publisher
- CronJob: "Toda segunda às 9h, publique uma dica do dia"
- Chat: "Publica um carrossel sobre as 5 tendências de 2026"

---

## 1. Pré-requisitos

### Instagram Graph API
- Conta Business ou Creator no Instagram
- Facebook App configurada com permissões `instagram_basic`, `instagram_content_publish`
- Access Token de longa duração (60 dias, renovável)

### Fluxo de autenticação
```
1. Usuário cria App no Facebook Developers
2. Configura permissões Instagram
3. Gera token via Graph API Explorer
4. Cola o token na página Config do LumiPlus
```

---

## 2. Skill: instagram_publish

### Tool Definition

```typescript
{
  name: 'instagram_publish',
  description: 'Publica um post ou carrossel no Instagram',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['post', 'carousel', 'story'], description: 'Tipo de publicação' },
      caption: { type: 'string', description: 'Legenda do post (hashtags incluídas)' },
      image_urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'URLs públicas das imagens (1 para post, 2-10 para carrossel)'
      },
    },
    required: ['type', 'caption', 'image_urls'],
  },
}
```

### Handler

```typescript
async function handleInstagramPublish(args: any, ctx: SkillContext) {
  const accessToken = ctx.credentials.instagram_access_token;
  const userId = ctx.credentials.instagram_user_id;
  if (!accessToken || !userId) return 'Credenciais do Instagram não configuradas.';

  const { type, caption, image_urls } = args;
  const baseUrl = 'https://graph.facebook.com/v21.0';

  if (type === 'post') {
    // 1. Criar container de mídia
    const createRes = await fetch(`${baseUrl}/${userId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: image_urls[0],
        caption,
        access_token: accessToken,
      }),
    });
    const { id: containerId } = await createRes.json();

    // 2. Publicar
    const publishRes = await fetch(`${baseUrl}/${userId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });
    const { id: mediaId } = await publishRes.json();
    return `Post publicado com sucesso! ID: ${mediaId}`;
  }

  if (type === 'carousel') {
    // 1. Criar containers individuais
    const containerIds = [];
    for (const url of image_urls.slice(0, 10)) {
      const res = await fetch(`${baseUrl}/${userId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: url,
          is_carousel_item: true,
          access_token: accessToken,
        }),
      });
      const { id } = await res.json();
      containerIds.push(id);
    }

    // 2. Criar container do carrossel
    const carouselRes = await fetch(`${baseUrl}/${userId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        children: containerIds,
        caption,
        access_token: accessToken,
      }),
    });
    const { id: carouselId } = await carouselRes.json();

    // 3. Publicar
    const publishRes = await fetch(`${baseUrl}/${userId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: carouselId,
        access_token: accessToken,
      }),
    });
    const { id: mediaId } = await publishRes.json();
    return `Carrossel com ${image_urls.length} imagens publicado! ID: ${mediaId}`;
  }

  return `Tipo "${type}" não suportado ainda.`;
}
```

---

## 3. Credenciais

| Chave | Label | Obrigatória |
|-------|-------|-------------|
| `instagram_access_token` | Instagram Access Token | Sim |
| `instagram_user_id` | Instagram User ID | Sim |
| `imgbb_api_key` | ImgBB API Key (upload de imagens) | Opcional |

### Upload de imagens

A Graph API do Instagram precisa de **URLs públicas** das imagens. Opções:
1. **ImgBB** — upload gratuito via API, retorna URL pública
2. **Cloudinary** — upload + transformação
3. **S3/R2** — storage próprio

Skill auxiliar `upload_image`:
```typescript
{
  name: 'upload_image',
  description: 'Faz upload de uma imagem e retorna URL pública',
  parameters: {
    type: 'object',
    properties: {
      image_base64: { type: 'string', description: 'Imagem em base64' },
      filename: { type: 'string', description: 'Nome do arquivo' },
    },
    required: ['image_base64'],
  },
}
```

---

## 4. Instagram como Canal de DM (futuro)

Além de publicar, o Instagram pode ser um **canal de atendimento** (como WhatsApp/Telegram):
- Bot responde DMs do Instagram automaticamente
- Usa a mesma arquitetura de `ChannelManager`
- Instagram Messaging API (webhook)

Isso seria uma evolução separada — primeiro publicação, depois DMs.

---

## 5. Fluxo Completo com Squad

```
[Squad "Social Media"]

Pesquisador (web_search) → pesquisa tendências do dia
    ↓
Redator (knowledge_search) → escreve legenda otimizada
    ↓
Designer (image_creator) → gera imagem do post
    ↓
Publisher (instagram_publish) → publica no Instagram

CronJob: Todo dia às 9h
```

---

## 6. Checklist de Implementação

```
[ ] Skill instagram_publish no catálogo (post + carrossel)
[ ] Handler com Instagram Graph API v21.0
[ ] Skill upload_image (ImgBB ou Cloudinary)
[ ] Credenciais: instagram_access_token, instagram_user_id, imgbb_api_key
[ ] Instrução no system prompt para uso correto
[ ] Testar: post único com imagem
[ ] Testar: carrossel com 3+ imagens
[ ] Documentar fluxo de autenticação para o usuário
```

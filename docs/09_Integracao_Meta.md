# Integração Meta — Facebook, Instagram e WhatsApp Business
Versão: 1.0 | Documento novo

---

## Visão Geral

A integração Meta permite que os agentes do Lumi Plus atuem diretamente nas plataformas da Meta:

- **Instagram DM:** responder mensagens diretas automaticamente
- **Facebook Messenger:** atendimento via Messenger
- **Facebook Pages:** postar conteúdo, responder comentários
- **Instagram Feed:** publicar posts e stories via API
- **Lead Ads:** capturar e processar leads de anúncios automaticamente
- **WhatsApp Business API:** canal oficial para produção (substitui Baileys)

---

## 1. Configuração do App Meta

### Passo a Passo

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Crie um novo app → tipo "Business"
3. Adicione os produtos: **Messenger**, **Instagram**, **WhatsApp Business** (conforme necessário)
4. Em "Configurações Básicas", anote:
   - `App ID`
   - `App Secret`
5. Gere um `Page Access Token` permanente para cada página vinculada

### Permissões Necessárias

| Permissão | Para que serve |
|-----------|----------------|
| `pages_messaging` | Enviar/receber Messenger |
| `instagram_basic` | Ler perfil Instagram |
| `instagram_manage_messages` | DMs do Instagram |
| `pages_read_engagement` | Ler comentários |
| `pages_manage_posts` | Publicar posts |
| `leads_retrieval` | Capturar leads de anúncios |
| `whatsapp_business_messaging` | WhatsApp Business API |

---

## 2. Configuração via Chat (Sem Abrir Dashboard)

O dono do workspace pode configurar a integração diretamente pelo WhatsApp ou Telegram:

```
Dono: /config api facebook APP_ID APP_SECRET PAGE_TOKEN

Sistema: ✅ Integração Meta configurada!

Plataformas disponíveis:
• Facebook Messenger
• Instagram DM
• Publicação em páginas

Use /config meta instagram PAGE_ID para vincular o Instagram.
```

### Comandos Meta disponíveis

```
/config api facebook <APP_ID> <APP_SECRET> <PAGE_TOKEN>
/config meta instagram <INSTAGRAM_ACCOUNT_ID>
/config meta webhook verificar
/config meta status
```

---

## 3. Webhook Meta — Receber Mensagens

O Lumi Plus registra um único webhook que recebe eventos de todas as plataformas Meta.

### Endpoint

```
POST /webhooks/meta
GET  /webhooks/meta  ← verificação inicial do Meta
```

### Verificação do Webhook

```typescript
// src/routes/webhooks/meta.ts

// GET — verificação inicial exigida pelo Meta
app.get('/webhooks/meta', (req, reply) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return reply.send(challenge);
  }
  return reply.status(403).send();
});

// POST — receber eventos
app.post('/webhooks/meta', async (req, reply) => {
  // Valida assinatura HMAC
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!validateMetaSignature(req.rawBody, signature)) {
    return reply.status(401).send();
  }

  const body = req.body as MetaWebhookPayload;

  // Processa cada entrada
  for (const entry of body.entry) {
    if (body.object === 'instagram') {
      await processInstagramEvent(entry);
    } else if (body.object === 'page') {
      await processMessengerEvent(entry);
    } else if (body.object === 'whatsapp_business_account') {
      await processWhatsAppBusinessEvent(entry);
    }
  }

  reply.status(200).send('EVENT_RECEIVED');
});

function validateMetaSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.META_APP_SECRET!)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature.replace('sha256=', '')),
    Buffer.from(expected)
  );
}
```

### Processamento de DM do Instagram

```typescript
async function processInstagramEvent(entry: MetaEntry) {
  for (const messaging of entry.messaging ?? []) {
    if (!messaging.message) continue;

    const message: LumiMessage = {
      id: messaging.message.mid,
      channel_type: 'instagram_dm',
      channel_id: entry.id,
      sender_id: messaging.sender.id,
      content: messaging.message.text ?? '',
      content_type: 'text',
      is_command: messaging.message.text?.startsWith('/') ?? false,
      raw_payload: messaging,
      received_at: new Date()
    };

    await messageRouter.route(message);
  }
}
```

---

## 4. Enviar Respostas pelo Instagram DM

```typescript
// src/services/channels/InstagramService.ts

export class InstagramService {
  async sendMessage(recipientId: string, text: string, pageToken: string) {
    const chunks = chunkMessage(text, 1000); // Instagram DM: 1000 chars

    for (const chunk of chunks) {
      await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pageToken}`
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: chunk }
        })
      });
      await sleep(500); // delay entre chunks
    }
  }
}
```

---

## 5. Publicar no Facebook/Instagram via Tool Use

O agente pode postar conteúdo autonomamente quando autorizado.

### Tool: `facebook_post`

```json
{
  "tool": "facebook_post",
  "page_id": "123456789",
  "message": "🚀 Novidade incrível chegando! Fique ligado.",
  "image_url": "https://cdn.exemplo.com/imagem.jpg",
  "schedule_time": null
}
```

### Tool: `instagram_post`

```json
{
  "tool": "instagram_post",
  "account_id": "987654321",
  "caption": "Novo post gerado pelo agente Max! #marketing #ia",
  "image_url": "https://cdn.exemplo.com/post.jpg"
}
```

### Implementação

```typescript
// src/tools/FacebookPostTool.ts

export async function facebookPost(params: FacebookPostParams, agent: Agent) {
  const pageToken = await apiKeyVault.get(agent.id, 'facebook_page_token');

  // Publica foto
  if (params.image_url) {
    const photoRes = await fetch(
      `https://graph.facebook.com/v18.0/${params.page_id}/photos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: params.image_url,
          caption: params.message,
          access_token: pageToken
        })
      }
    );
    return photoRes.json();
  }

  // Publica só texto
  const postRes = await fetch(
    `https://graph.facebook.com/v18.0/${params.page_id}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        access_token: pageToken
      })
    }
  );
  return postRes.json();
}
```

---

## 6. Lead Ads — Captura Automática de Leads

Quando alguém preenche um formulário de Lead Ad, o agente recebe o lead automaticamente e pode iniciar uma conversa.

### Configuração do Webhook

```typescript
// Receber novo lead
async function processLeadEvent(entry: MetaEntry) {
  for (const change of entry.changes ?? []) {
    if (change.field !== 'leadgen') continue;

    const leadId = change.value.leadgen_id;
    const formId = change.value.form_id;
    const pageId = change.value.page_id;

    // Busca dados do lead na API
    const pageToken = await apiKeyVault.getByPageId(pageId);
    const leadData = await fetchLeadData(leadId, pageToken);

    // Cria contato e inicia conversa
    await contactService.createFromLead(leadData);

    // Dispara skill do agente
    await agentQueue.add('process_lead', {
      agentId: await resolveAgentForPage(pageId),
      lead: leadData,
      triggeredBy: 'lead_ad'
    });
  }
}

async function fetchLeadData(leadId: string, token: string) {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${leadId}?access_token=${token}`
  );
  return res.json();
  // Retorna: { id, field_data: [{name: "email", values: [...]}, {name: "name", ...}] }
}
```

---

## 7. WhatsApp Business API Oficial

Para produção com clientes reais — substitui o Baileys quando necessário.

### Quando Migrar do Baileys

| Situação | Usar |
|----------|------|
| Protótipo / testes | Baileys |
| Até ~500 clientes | Baileys (com cuidado) |
| Produção com clientes reais | WhatsApp Business API |
| Empresa verificada pela Meta | WhatsApp Business API |

### Providers Recomendados

| Provider | Vantagem |
|----------|----------|
| 360dialog | Mais barato, setup simples |
| Twilio | Mais robusto, melhor suporte |
| Meta Cloud API direta | Grátis até 1.000 conversas/mês |

### Setup via CLI

```bash
lumi channel add whatsapp-business \
  --provider 360dialog \
  --api-key d360-xxx \
  --phone-number-id 12345 \
  --no-interactive
```

### Diferenças na Implementação

A camada de normalização (`LumiMessage`) abstrai as diferenças — o agente não precisa saber qual implementação está sendo usada:

```typescript
// src/services/channels/WhatsAppBusinessService.ts

export class WhatsAppBusinessService implements ChannelService {
  async sendMessage(to: string, text: string) {
    await fetch(
      `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text }
        })
      }
    );
  }
}
```

---

## 8. Variáveis de Ambiente

```env
# Meta / Facebook
META_APP_ID=123456789
META_APP_SECRET=abc123...
META_WEBHOOK_VERIFY_TOKEN=meu-token-verificacao-aleatorio
META_PAGE_ACCESS_TOKEN=EAAabc...  # token da página principal

# WhatsApp Business API (se usar)
WA_BUSINESS_PHONE_NUMBER_ID=12345
WA_BUSINESS_TOKEN=EAAabc...

# Instagram
INSTAGRAM_ACCOUNT_ID=987654321
```

Ou via vault criptografado (recomendado para produção):
```bash
lumi vault set facebook_app_secret "abc123..."
lumi vault set facebook_page_token "EAAabc..."
```

---

## 9. Checklist de Ativação

```
[ ] App Meta criado com tipo "Business"
[ ] Permissões solicitadas e aprovadas
[ ] Webhook registrado e verificado
[ ] Page Access Token permanente gerado
[ ] META_WEBHOOK_VERIFY_TOKEN configurado no .env
[ ] META_APP_SECRET configurado para validação HMAC
[ ] Endpoint HTTPS ativo (Meta exige HTTPS)
[ ] Teste de DM do Instagram funcionando
[ ] Teste de postagem funcionando
```

---

## 10. Roadmap Meta

| Feature | Versão | Status |
|---------|--------|--------|
| Instagram DM | 1.1 | 🔜 Próximo |
| Facebook Messenger | 1.1 | 🔜 Próximo |
| Publicação Facebook/Instagram | 1.1 | 🔜 Próximo |
| Lead Ads | 1.1 | 🔜 Próximo |
| WhatsApp Business API oficial | Qualquer | Migração produção |
| Instagram Comments reply | 1.2 | Roadmap |
| Meta Ads API (métricas) | 1.2 | Roadmap |
| Instagram Stories | 2.0 | Futuro |

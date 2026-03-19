# Fase 32: Multi-Social Publisher — Publicação em Múltiplas Redes Sociais
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Skill unificada que permite ao agente **publicar e agendar posts em múltiplas redes sociais** com uma única chamada. O agente cria o conteúdo e distribui automaticamente para as plataformas selecionadas.

Redes suportadas:
- Instagram (Graph API)
- LinkedIn (LinkedIn API)
- Twitter/X (X API v2)
- TikTok (Content Publishing API)
- Facebook Pages (Graph API)
- YouTube (shorts via YouTube Data API)

---

## 1. Arquitetura

### Publisher Unificado

Em vez de uma skill por rede, uma única skill `social_publish` que aceita múltiplas plataformas:

```typescript
{
  name: 'social_publish',
  description: 'Publica conteúdo em uma ou mais redes sociais simultaneamente',
  parameters: {
    type: 'object',
    properties: {
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['instagram', 'linkedin', 'twitter', 'tiktok', 'facebook', 'youtube'] },
        description: 'Redes sociais onde publicar'
      },
      content: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto/legenda do post' },
          image_urls: { type: 'array', items: { type: 'string' }, description: 'URLs das imagens' },
          video_url: { type: 'string', description: 'URL do vídeo (TikTok/YouTube/Reels)' },
          hashtags: { type: 'array', items: { type: 'string' }, description: 'Hashtags' },
          link: { type: 'string', description: 'Link externo (LinkedIn/Twitter)' },
        },
        required: ['text'],
      },
      schedule: {
        type: 'string',
        description: 'Agendar para data/hora ISO (opcional). Ex: 2026-03-20T14:00:00'
      },
    },
    required: ['platforms', 'content'],
  },
}
```

### Adapters por Plataforma

Cada rede tem formato e API diferentes. O handler converte o formato unificado:

```typescript
interface SocialAdapter {
  platform: string;
  publish(content: SocialContent, credentials: Record<string, string>): Promise<SocialResult>;
}

// Adapters implementados
const adapters: Record<string, SocialAdapter> = {
  instagram: new InstagramAdapter(),   // Graph API
  linkedin: new LinkedInAdapter(),     // LinkedIn API
  twitter: new TwitterAdapter(),       // X API v2
  tiktok: new TikTokAdapter(),        // Content Publishing API
  facebook: new FacebookAdapter(),     // Graph API (Pages)
};
```

---

## 2. Credenciais por Plataforma

| Plataforma | Chaves necessárias |
|------------|-------------------|
| Instagram | `instagram_access_token`, `instagram_user_id` |
| LinkedIn | `linkedin_access_token` |
| Twitter/X | `twitter_api_key`, `twitter_api_secret`, `twitter_access_token`, `twitter_access_secret` |
| TikTok | `tiktok_access_token` |
| Facebook | `facebook_page_token`, `facebook_page_id` |

As credenciais são configuradas como credentials da skill no marketplace.

---

## 3. Adaptação de Conteúdo por Plataforma

O handler adapta automaticamente o conteúdo para cada rede:

| Aspecto | Instagram | LinkedIn | Twitter/X | TikTok |
|---------|-----------|----------|-----------|--------|
| Texto máx | 2200 chars | 3000 chars | 280 chars | 2200 chars |
| Hashtags | No texto | No texto | No texto | Na descrição |
| Imagens | Obrigatória | Opcional | Opcional | Não (só vídeo) |
| Link | No bio (link.tree) | No texto | No texto | No bio |
| Formato | Quadrado/vertical | Horizontal | Qualquer | Vertical 9:16 |

```typescript
function adaptContent(content: SocialContent, platform: string): SocialContent {
  const adapted = { ...content };

  if (platform === 'twitter' && adapted.text.length > 280) {
    adapted.text = adapted.text.slice(0, 277) + '...';
  }

  if (platform === 'linkedin' && adapted.link) {
    adapted.text += `\n\n${adapted.link}`;
  }

  if (adapted.hashtags?.length) {
    const tags = adapted.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
    adapted.text += `\n\n${tags}`;
  }

  return adapted;
}
```

---

## 4. Agendamento

Para posts agendados, o handler salva no banco e o CronService publica no horário:

```prisma
model ScheduledPost {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  agentId     String   @map("agent_id")
  platforms   String[] // ['instagram', 'linkedin']
  content     Json     // { text, image_urls, hashtags }
  scheduledAt DateTime @map("scheduled_at")
  status      String   @default("pending") // pending, published, failed
  results     Json?    // resultado por plataforma
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("scheduled_posts")
}
```

CronJob verifica a cada 1 minuto se há posts pendentes com `scheduledAt <= now()`.

---

## 5. Fluxo com Squad

### Exemplo: "Post diário de marketing"

```
[Squad "Social Media Daily"]

1. Pesquisador
   → web_search("tendências marketing digital hoje")
   → Retorna: 3 tendências encontradas

2. Redator
   → Cria texto otimizado para cada rede
   → Instagram: texto longo + hashtags
   → Twitter: versão curta (280 chars)
   → LinkedIn: versão profissional

3. Designer
   → image_creator: gera imagem do post
   → upload_image: sobe no ImgBB

4. Publisher
   → social_publish:
     platforms: ["instagram", "linkedin", "twitter"]
     content: { text, image_urls, hashtags }

CronJob: Todo dia às 9h, segunda a sexta
```

### Exemplo: "Carrossel Instagram + Post LinkedIn"

```
Usuário no chat: "Cria um carrossel sobre 5 dicas de produtividade e posta no Instagram e LinkedIn"

Agente:
1. knowledge_search("produtividade") → busca dicas na base
2. Cria 5 slides de texto
3. image_creator → gera 5 imagens
4. upload_image → URLs públicas
5. social_publish(
     platforms: ["instagram", "linkedin"],
     content: { text: "5 dicas...", image_urls: [...5 urls] }
   )
   → Instagram: carrossel com 5 imagens
   → LinkedIn: post com primeira imagem + texto completo
```

---

## 6. UI — Redes Sociais na Página Canais

Adicionar seção na página de Canais do agente:

```
┌──────────────────────────────────────────────────┐
│ 📱 REDES SOCIAIS                                  │
│                                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│ │ Instagram│ │ LinkedIn │ │ Twitter  │           │
│ │ ✅ Ativo │ │ ❌ Inativo│ │ ❌ Inativo│           │
│ │[Configurar]│[Conectar] │[Conectar] │           │
│ └──────────┘ └──────────┘ └──────────┘           │
│                                                    │
│ ┌──────────┐ ┌──────────┐                         │
│ │ TikTok   │ │ Facebook │                         │
│ │ ❌ Inativo│ │ ❌ Inativo│                         │
│ │[Conectar] │[Conectar] │                         │
│ └──────────┘ └──────────┘                         │
│                                                    │
│ 📅 POSTS AGENDADOS                                │
│ • "5 dicas de produtividade" — 20/03 às 9h — IG+LI│
│ • "Tendência do dia" — 21/03 às 10h — IG+TW       │
└──────────────────────────────────────────────────┘
```

---

## 7. Checklist de Implementação

```
[ ] Skill social_publish no catálogo com tool definition
[ ] InstagramAdapter — Graph API (post + carrossel)
[ ] LinkedInAdapter — LinkedIn API (post com imagem)
[ ] TwitterAdapter — X API v2 (tweet com mídia)
[ ] FacebookAdapter — Graph API Pages (post)
[ ] TikTokAdapter — Content Publishing API (vídeo)
[ ] Skill upload_image — ImgBB ou Cloudinary
[ ] Adaptação automática de conteúdo por plataforma
[ ] Model ScheduledPost no Prisma
[ ] CronJob para posts agendados
[ ] UI: seção Redes Sociais na página Canais
[ ] UI: lista de posts agendados
[ ] Credenciais por plataforma no marketplace de skills
[ ] System prompt: instruções de uso do social_publish
```

---

## 8. Prioridade de Implementação

| Ordem | Plataforma | Justificativa |
|-------|------------|---------------|
| 1 | Instagram | Mais demandada, Graph API documentada |
| 2 | LinkedIn | Mercado B2B, API simples |
| 3 | Twitter/X | Grande alcance, API acessível |
| 4 | Facebook | Mesma API do Instagram (Graph API) |
| 5 | TikTok | API mais restritiva, vídeo only |

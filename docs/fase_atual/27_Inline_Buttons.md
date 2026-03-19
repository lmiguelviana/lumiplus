# Fase 27: Inline Buttons — Menus Interativos nos Canais
Versão: 1.0 | PRIORIDADE ALTA

---

## Visão

Permitir que agentes enviem **botões interativos** nas respostas — menus de opções, confirmações, navegação. Funciona no WhatsApp, Telegram e Web Chat.

Hoje o bot só responde texto puro. Com botões, a UX muda completamente:
- Atendimento guiado ("Escolha: [Vendas] [Suporte] [Financeiro]")
- Confirmações rápidas ("[Sim, confirmar] [Não, cancelar]")
- Navegação ("Ver detalhes | Voltar ao menu")
- Catálogos ("Produto A — R$99 [Comprar]")

---

## 1. Formato Unificado de Botões

O agente retorna botões usando uma marcação simples no texto. O sistema detecta e converte para o formato nativo de cada canal.

### Sintaxe no texto da IA

```
Escolha uma opção:

[[buttons]]
[Vendas] [Suporte] [Financeiro]
[[/buttons]]
```

Ou inline:

```
Confirma o agendamento para amanhã às 14h?
[[buttons]] [Sim, confirmar] [Não, cancelar] [[/buttons]]
```

### Tipos de botão

| Tipo | Sintaxe | Uso |
|------|---------|-----|
| Quick Reply | `[Texto]` | Resposta rápida — envia o texto como mensagem |
| URL | `[Texto](https://...)` | Abre link externo |
| Callback | `[Texto]{callback:acao_id}` | Dispara ação interna sem enviar texto |

---

## 2. Conversão por Canal

### WhatsApp (Baileys)

WhatsApp suporta 2 tipos nativos:

**Buttons (até 3 botões):**
```typescript
{
  text: 'Escolha uma opção:',
  buttons: [
    { buttonId: 'vendas', buttonText: { displayText: 'Vendas' } },
    { buttonId: 'suporte', buttonText: { displayText: 'Suporte' } },
    { buttonId: 'financeiro', buttonText: { displayText: 'Financeiro' } },
  ],
  headerType: 1
}
```

**List (mais de 3 opções):**
```typescript
{
  text: 'Escolha um departamento:',
  buttonText: 'Ver opções',
  sections: [{
    title: 'Departamentos',
    rows: [
      { title: 'Vendas', rowId: 'vendas', description: 'Falar com vendedor' },
      { title: 'Suporte', rowId: 'suporte', description: 'Suporte técnico' },
      { title: 'Financeiro', rowId: 'financeiro', description: 'Boletos e NF' },
    ]
  }]
}
```

> **Nota:** WhatsApp Business API tem restrições. Baileys suporta buttons mas Meta pode bloquear em contas não-business. Alternativa: enviar como texto numerado ("1. Vendas\n2. Suporte\n3. Financeiro").

### Telegram (Bot API)

Telegram suporta inline keyboards nativamente:

```typescript
{
  text: 'Escolha uma opção:',
  reply_markup: {
    inline_keyboard: [
      [
        { text: 'Vendas', callback_data: 'vendas' },
        { text: 'Suporte', callback_data: 'suporte' },
      ],
      [
        { text: 'Financeiro', callback_data: 'financeiro' },
      ],
      [
        { text: 'Abrir site', url: 'https://exemplo.com' },
      ]
    ]
  }
}
```

### Web Chat

No chat web, renderiza como botões HTML estilizados:

```html
<div class="inline-buttons">
  <button data-action="vendas">Vendas</button>
  <button data-action="suporte">Suporte</button>
  <button data-action="financeiro">Financeiro</button>
</div>
```

---

## 3. Backend — Parser de Botões

### `ButtonParserService`

```typescript
// src/services/button-parser.service.ts

interface ParsedButton {
  text: string;
  type: 'reply' | 'url' | 'callback';
  value: string; // texto, URL ou callback_id
}

interface ParsedMessage {
  text: string;           // texto sem os botões
  buttons: ParsedButton[];
  hasButtons: boolean;
}

export class ButtonParserService {

  /** Extrai botões da resposta da IA */
  static parse(content: string): ParsedMessage {
    const buttonRegex = /\[\[buttons\]\]([\s\S]*?)\[\[\/buttons\]\]/g;
    let textWithout = content;
    const buttons: ParsedButton[] = [];

    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const block = match[1];
      textWithout = textWithout.replace(match[0], '').trim();

      // [Texto](url) → URL button
      const urlBtnRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
      let urlMatch;
      while ((urlMatch = urlBtnRegex.exec(block)) !== null) {
        buttons.push({ text: urlMatch[1], type: 'url', value: urlMatch[2] });
      }

      // [Texto]{callback:id} → Callback button
      const cbBtnRegex = /\[([^\]]+)\]\{callback:([^\}]+)\}/g;
      let cbMatch;
      while ((cbMatch = cbBtnRegex.exec(block)) !== null) {
        buttons.push({ text: cbMatch[1], type: 'callback', value: cbMatch[2] });
      }

      // [Texto] → Quick Reply
      const replyBtnRegex = /\[([^\]]+)\](?!\(|{)/g;
      let replyMatch;
      while ((replyMatch = replyBtnRegex.exec(block)) !== null) {
        // Evita duplicatas de URL/callback
        if (!buttons.find(b => b.text === replyMatch[1])) {
          buttons.push({ text: replyMatch[1], type: 'reply', value: replyMatch[1] });
        }
      }
    }

    return { text: textWithout, buttons, hasButtons: buttons.length > 0 };
  }
}
```

### Adapters por canal

```typescript
// src/services/button-adapters.ts

export function toWhatsAppButtons(parsed: ParsedMessage) {
  if (parsed.buttons.length <= 3) {
    return {
      text: parsed.text,
      buttons: parsed.buttons.map((b, i) => ({
        buttonId: b.value || `btn_${i}`,
        buttonText: { displayText: b.text },
      })),
      headerType: 1,
    };
  }
  // Lista para mais de 3
  return {
    text: parsed.text,
    buttonText: 'Ver opções',
    sections: [{
      title: 'Opções',
      rows: parsed.buttons.map((b, i) => ({
        title: b.text,
        rowId: b.value || `btn_${i}`,
      })),
    }],
  };
}

export function toTelegramButtons(parsed: ParsedMessage) {
  const rows = [];
  for (let i = 0; i < parsed.buttons.length; i += 2) {
    const row = [parsed.buttons[i]];
    if (parsed.buttons[i + 1]) row.push(parsed.buttons[i + 1]);
    rows.push(row.map(b =>
      b.type === 'url'
        ? { text: b.text, url: b.value }
        : { text: b.text, callback_data: b.value }
    ));
  }
  return { inline_keyboard: rows };
}

export function toWebChatButtons(parsed: ParsedMessage) {
  return parsed.buttons.map(b => ({
    label: b.text,
    type: b.type,
    value: b.value,
  }));
}
```

---

## 4. Integração com AIService

O agente precisa saber que pode usar botões. Adicionar no system prompt:

```
Quando quiser oferecer opções ao usuário, use a sintaxe de botões:
[[buttons]] [Opção 1] [Opção 2] [Opção 3] [[/buttons]]

Para links: [[buttons]] [Abrir site](https://exemplo.com) [[/buttons]]

Use botões quando:
- O usuário precisa escolher entre opções
- Você quer confirmar uma ação (Sim/Não)
- Há um menu de navegação
```

---

## 5. Handling de Callback

Quando o usuário clica num botão:
- **Quick Reply**: o texto do botão é enviado como mensagem normal → entra no fluxo padrão
- **URL**: abre no navegador → sem ação no backend
- **Callback**: dispara uma ação sem enviar texto → backend processa e responde

```typescript
// No handler de mensagem do Telegram
if (update.callback_query) {
  const data = update.callback_query.data;
  // Trata como mensagem do usuário
  await processMessage(tenantId, agentId, data, senderId);
  // Responde o callback (remove loading)
  await bot.answerCallbackQuery(update.callback_query.id);
}
```

---

## 6. Skill de Botões para o Agente

Adicionar como tool disponível para a IA decidir quando usar:

```typescript
{
  type: 'function',
  function: {
    name: 'send_buttons',
    description: 'Envia uma mensagem com botões interativos para o usuário',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Texto da mensagem' },
        buttons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              type: { type: 'string', enum: ['reply', 'url'] },
              value: { type: 'string' },
            },
          },
        },
      },
      required: ['message', 'buttons'],
    },
  },
}
```

---

## 7. Checklist de Implementação

```
[x] ButtonParserService — detecta [[buttons]], extrai Quick Reply/URL/Callback ✅ 18/03/2026
[x] toWhatsApp() — buttons (≤3) ou list (>3) no formato Baileys ✅ 18/03/2026
[x] toTelegram() — inline_keyboard com 2 botões por linha ✅ 18/03/2026
[x] toWebChat() — JSON { label, type, value } para frontend ✅ 18/03/2026
[x] toTextFallback() — texto numerado se canal não suporta botões ✅ 18/03/2026
[x] Integrado no WhatsApp (whatsapp.service.ts) com fallback ✅ 18/03/2026
[x] Integrado no Telegram (telegram.service.ts) ✅ 18/03/2026
[x] Integrado na API /ai/chat (retorna buttons[] para web) ✅ 18/03/2026
[x] Callback handler no Telegram (callback_query → processa como mensagem) ✅ 18/03/2026
[x] Renderizar botões no Web Chat (botões clicáveis que enviam resposta) ✅ 18/03/2026
[x] Skill inline_buttons no catálogo (instrução no system prompt) ✅ 18/03/2026
[x] Handler send_buttons no SkillRegistry (tool calling) ✅ 18/03/2026
```

---

## 8. Exemplo de Fluxo Completo

```
Usuário: "Quero falar com alguém"

IA responde:
"Claro! Com qual departamento você quer falar?
[[buttons]] [Vendas] [Suporte Técnico] [Financeiro] [[/buttons]]"

→ Parser detecta 3 botões
→ WhatsApp: envia como buttons nativo
→ Telegram: envia como inline_keyboard
→ Web Chat: renderiza 3 botões HTML

Usuário clica "Suporte Técnico"
→ Envia "Suporte Técnico" como mensagem
→ IA recebe e continua o fluxo
```

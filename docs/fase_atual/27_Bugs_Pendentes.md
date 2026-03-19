# Bugs & Melhorias Pendentes (18/03/2026)

---

## 1. WhatsApp — "Erro técnico ao processar resposta"

### Sintoma
O agente no WhatsApp responde "Erro técnico ao processar resposta." para qualquer mensagem.

### Causa
Request Time-out na chamada ao OpenRouter. Possíveis razões:
- Chave OpenRouter expirada ou sem créditos
- Timeout do fetch sem limite configurado
- Modelo indisponível no momento

### Solução aplicada ✅ 18/03/2026
```
[x] Timeout de 30s no fetch do AIService (AbortController)
[x] Mensagem clara ao usuário: "A IA demorou demais" em vez de "Erro técnico"
[x] Tratamento de 429 (rate limit) com mensagem específica
[x] Log detalhado do erro (modelo, status, response)
[ ] Verificar créditos do OpenRouter (manual pelo usuário)
```

---

## 2. Telegram — Erro ao conectar via ConnectorModal

### Sintoma
Ao colar o token do bot e clicar "Sincronizar Canal", dá "ERRO NA OPERAÇÃO - Internal Server Error".

### Causa
O `POST /channels/:agentId/connect` falha ao tentar `channelManager.startChannel()` após salvar o token. Possíveis razões:
- channelManager já tem uma instância rodando para esse agente
- Erro no Telegraf ao iniciar com token inválido
- Conflito de instâncias (bot já startado no bootstrap)

### Solução aplicada ✅ 18/03/2026
```
[x] POST /channels/:agentId/connect agora para instância existente antes de reconectar
[x] Log detalhado no startChannel do Telegram (erro específico)
[x] Validação de type + token obrigatórios
[ ] Testar reconexão com token válido
```

---

## 3. Chat Web — Conversas isoladas do WhatsApp/Telegram

### Sintoma
O chat web mostra conversas separadas. O usuário quer que as conversas do WhatsApp e Telegram apareçam no chat web também — um histórico unificado.

### Visão do usuário
- Chat web deve mostrar conversas existentes do WhatsApp/Telegram
- Só cria um novo chat se o usuário iniciar manualmente
- Chats antigos ficam na memória do sistema (histórico)
- Sidebar com lista de conversas anteriores

### Solução aplicada ✅ 18/03/2026
```
[x] GET /ai/conversations/:agentId — lista conversas (web + wa + tg) com preview
[x] POST /ai/conversations/:agentId — cria nova conversa web
[x] GET /ai/conversations/:agentId/:id/messages — carrega mensagens
[x] POST /ai/chat agora persiste mensagens no histórico (se conversationId)
[x] Sidebar no chat web com lista de conversas anteriores
[x] Botão "Nova Conversa" para iniciar chat limpo
[x] Badge de canal (📱 WhatsApp, ✈️ Telegram, 🌐 Web)
[x] Conversa ativa destacada na sidebar
```

---

## 4. Prisma Singleton (RESOLVIDO ✅)

### Sintoma
"TOO MANY DATABASE CONNECTIONS OPENED" — sistema parava de funcionar.

### Causa
25 instâncias de `new PrismaClient()` espalhadas pelo código. Cada uma abria pool de conexões.

### Solução aplicada
- Criado `backend/src/lib/prisma.ts` com singleton global
- Todos os 23 arquivos atualizados para usar `import { prisma } from '../lib/prisma.js'`
- Agora usa 1 única conexão em todo o sistema

---

## 5. Tema Claro — Possíveis problemas visuais

### Sintoma
Algumas áreas podem ter cores hardcoded (bg-zinc-950, text-white) que não adaptam ao tema claro.

### Solução
```
[ ] Auditoria de classes com cores fixas (zinc-950, zinc-900, etc.)
[ ] Substituir por variáveis CSS (bg-surface, bg-background, text-foreground)
[ ] Testar todas as páginas no tema claro
```

---

## Prioridade de Resolução

| # | Bug | Impacto | Complexidade |
|---|-----|---------|-------------|
| 1 | WhatsApp timeout | ALTO — agente não funciona | Baixa (timeout + fallback) |
| 2 | Telegram connect | MÉDIO — não conecta novo bot | Média (debug channelManager) |
| 3 | Chat unificado | ALTO — UX fragmentada | Alta (nova feature) |
| 5 | Tema claro | BAIXO — visual | Média (auditoria) |

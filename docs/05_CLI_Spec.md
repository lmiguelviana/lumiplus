# CLI Spec — Lumi Plus
Versão: 3.0 | `@lumiplus/cli`

---

## Visão Geral

O CLI do Lumi Plus instala, configura e opera a plataforma em qualquer OS (macOS, Linux, Windows) sem dependência de IDE específica. Roda em VPS, servidor ou PC.

**Meta de experiência:** do `npm install` ao primeiro agente respondendo em menos de 2 minutos.

**Libs:**
- `commander` — comandos e flags
- `inquirer` — wizard interativo
- `chalk` — output colorido
- `ora` — spinners
- `boxen` — caixas formatadas
- `node-cron` — cron jobs nativos

---

## Instalação

```bash
npm install -g @lumiplus/cli

# Via GitHub (contribuidores)
git clone https://github.com/usuario/lumiplus && cd lumiplus/cli && npm link

# Sem instalar
npx @lumiplus/cli init
```

**Requisito:** Node.js 20+

---

## Wizard — `lumi init`

### Passo 0: Detecção de Ambiente (automático)

```
╔══════════════════════════════════════╗
║   Lumi Plus CLI  v1.0.0              ║
╚══════════════════════════════════════╝

Verificando ambiente...
✓ Node.js 20.11.0
✓ Linux Ubuntu 22.04
✓ Git disponível
⚠ Docker não encontrado (opcional — self-hosted)
```

### Passo 1: Autenticação

```
Você já tem conta Lumi Plus?
❯ Sim — token API
  Não — criar conta

Token: sk-lumi-________________
✓ Workspace: Agência Alpha
Salvo em ~/.lumi/config.json (permissão 600)
```

### Passo 2: Banco de Dados

```
Onde seus dados ficam?
❯ Lumi Cloud (zero config)
  Supabase próprio
  Self-hosted (Docker)
```

### Passo 3: IA

```
❯ OpenRouter (recomendado)
  Chaves individuais
  Configurar depois

Key: sk-or-________________
✓ 47 modelos · Fallback: gpt-4o → claude → gemini → haiku
```

### Passo 4: Busca na Web (novo)

```
Quer que os agentes busquem informações na internet?
❯ Sim — configurar agora
  Depois

Provider de busca:
❯ Brave Search (gratuito, 2.000 req/mês — recomendado)
  Perplexity (via OpenRouter)
  Tavily
  Configurar depois

Brave API Key: BSA_________________
✓ Busca na web ativada!
```

### Passo 5: Primeiro Agente

```
Nome: Sofia
Missão: Atender clientes
Tom: ❯ Profissional  Informal  Técnico

Modelo:
❯ gpt-4o  claude-sonnet  gemini-flash  Auto

✓ Agente criado! ID: agt_a1b2c3
```

### Passo 6: Teste

```
Você: Oi, quem é você?
Sofia: Olá! Sou a Sofia...
Tokens: 84 · gpt-4o · 1.2s
```

### Passo 7: Próximos Passos

```
╔═══════════════════════════════════════╗
║  Pronto! Próximos passos:             ║
║  · Dashboard → app.lumiplus.com       ║
║  · WhatsApp  → lumi channel add wa    ║
║  · Telegram  → lumi channel add tg    ║
║  · Meta      → lumi channel add meta  ║
║  · Diagnose  → lumi doctor            ║
╚═══════════════════════════════════════╝
```

---

## Gateway (Daemon 24/7)

```bash
lumi gateway                    # foreground (dev)
lumi gateway --install-daemon   # systemd (VPS/servidor)
lumi gateway --pm2              # PM2
lumi gateway status             # ver status
lumi gateway restart            # reiniciar
lumi gateway logs --follow      # logs ao vivo
lumi gateway reload             # hot reload de config (sem restart)
```

---

## `lumi doctor` — Diagnóstico Automático

Verifica tudo e sugere correções. Essencial para self-hosted.

```bash
lumi doctor          # diagnóstico completo
lumi doctor --fix    # aplica correções automáticas onde possível
lumi doctor --json   # output JSON para scripts
```

**O que verifica:**

```
lumi doctor

Lumi Plus Diagnostic v1.0
══════════════════════════

🔍 Conectividade
  ✓ API backend acessível (217.76.48.224:3001)
  ✓ PostgreSQL conectado (pg 17)
  ✓ Redis conectado
  ✗ pgvector não encontrado
    → Execute: lumi doctor --fix para instalar a extensão

🔍 Autenticação
  ✓ Token válido
  ✓ Workspace: Agência Alpha
  ✓ JWT configurado

🔍 IA e Modelos
  ✓ OpenRouter acessível
  ✓ gpt-4o disponível
  ✗ claude-sonnet-4 — slug desatualizado
    → Slug correto: anthropic/claude-sonnet-4-5
    → Execute: lumi doctor --fix para corrigir

🔍 Canais
  ✓ WhatsApp: Conectado (+5511999990000)
  ✗ Telegram: Token inválido ou expirado
    → Reconfigure: lumi channel add telegram

🔍 Busca na Web
  ✗ Nenhum provider configurado
    → Configure: lumi config set brave-key BSA_xxx

🔍 Segurança
  ✓ VAULT_MASTER_KEY configurado
  ✓ JWT_SECRET com 64+ bytes
  ✗ Redis sem senha configurada
    → Risco de segurança em produção
    → Adicione REDIS_PASSWORD no .env

Resumo: 3 problemas encontrados (1 crítico, 2 avisos)
Execute: lumi doctor --fix para correções automáticas
```

### Implementação do `--fix`

```typescript
// src/commands/doctor.ts

const autoFixable = {
  'pgvector_missing': async () => {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    return '✓ pgvector instalado';
  },
  'model_slug_outdated': async (context) => {
    await agentService.updateAllSlugs(context.corrections);
    return '✓ Slugs de modelos atualizados';
  },
  'redis_no_auth': () => {
    console.log('Adicione REDIS_PASSWORD=sua-senha ao .env e reinicie');
    return null; // não auto-corrigível
  }
};
```

---

## `lumi cron` — Tarefas Agendadas

```bash
lumi cron create "0 9 * * *" --agent sofia --task "resumo matinal de notícias"
lumi cron create "0 18 * * 5" --agent max --task "relatório semanal de performance"
lumi cron list                  # listar todos os cron jobs
lumi cron pause <id>            # pausar
lumi cron resume <id>           # retomar
lumi cron delete <id>           # remover
lumi cron run <id>              # executar agora (teste)
lumi cron logs <id>             # histórico de execuções
```

**Exemplos:**

```bash
# Todo dia de semana às 9h — Sofia manda resumo de notícias
lumi cron create "0 9 * * 1-5" --agent sofia --task "busca notícias do nicho e manda resumo"

# Toda segunda às 8h — Max gera relatório
lumi cron create "0 8 * * 1" --agent max --task "gera relatório semanal de engajamento"

# A cada hora — Ana verifica novos leads
lumi cron create "0 * * * *" --agent ana --task "verifica novos leads no CRM"
```

---

## `lumi config` — Configuração Global

```bash
lumi config set brave-key BSA_xxx
lumi config set ollama-url http://localhost:11434
lumi config set default-model openai/gpt-4o
lumi config get brave-key
lumi config list
lumi config delete brave-key
```

---

## Todos os Comandos

### Auth
```bash
lumi login --token sk-lumi-xxx
lumi logout
lumi whoami
lumi token create "Nome"
lumi token list
lumi token revoke <id>
```

### Agentes
```bash
lumi agent create
lumi agent list
lumi agent get <id>
lumi agent edit <id>
lumi agent delete <id>
lumi agent run <id> "mensagem"
lumi agent chat <id>
lumi agent logs <id> [--follow]
lumi agent pause <id>
lumi agent resume <id>
```

### Squads
```bash
lumi squad create
lumi squad list
lumi squad get <id>
lumi squad run <id> "objetivo"
lumi squad deploy <id>
lumi squad pause <id>
```

### Canais
```bash
lumi channel add whatsapp
lumi channel add telegram
lumi channel add meta              # Facebook/Instagram
lumi channel add whatsapp-business # WA Business API oficial
lumi channel list
lumi channel status <id>
lumi channel remove <id>
lumi channel reload <id>           # hot reload sem restart
```

### Skills
```bash
lumi skill list
lumi skill install <nome>
lumi skill uninstall <nome>
lumi skill installed
```

### Banco
```bash
lumi db migrate
lumi db status
lumi db backup
```

### Diagnóstico
```bash
lumi status              # saúde geral
lumi doctor              # diagnóstico completo
lumi doctor --fix        # corrige automaticamente
lumi update              # atualiza o CLI
```

### Cron
```bash
lumi cron create "<schedule>" --agent <id> --task "<descrição>"
lumi cron list
lumi cron pause <id>
lumi cron resume <id>
lumi cron delete <id>
lumi cron run <id>
lumi cron logs <id>
```

### Vault
```bash
lumi vault set <chave> <valor>     # armazena criptografado
lumi vault get <chave>             # recupera (mostra mascarado)
lumi vault delete <chave>
lumi vault list
```

---

## Flags Globais

```bash
--help, -h       # ajuda
--version, -v    # versão
--json           # output JSON
--quiet, -q      # silencioso
--debug          # verbose
--config <path>  # config alternativo
```

---

## Variáveis de Ambiente (override)

```bash
LUMI_TOKEN=sk-lumi-xxx
LUMI_API_URL=http://localhost:3001
LUMI_DEBUG=true
```

---

## Modo Não-Interativo (CI/CD)

```bash
lumi agent create \
  --name "Bot de Suporte" \
  --mission "Atender clientes" \
  --model "openai/gpt-4o" \
  --tone "profissional" \
  --no-interactive

lumi channel add telegram \
  --agent-id agt_xxx \
  --token "7812345:AAF_xxx" \
  --no-interactive

lumi channel add meta \
  --app-id 123 \
  --app-secret abc \
  --page-token EAA... \
  --no-interactive
```

---

## Config File — `~/.lumi/config.json`

```json
{
  "token": "sk-lumi-xxx",
  "tenant_id": "uuid",
  "workspace": "agencia-alpha",
  "api_url": "https://api.lumiplus.com",
  "db_mode": "cloud",
  "version": "1.0.0"
}
```

Permissão `600`. Token nunca aparece em log ou output.

---

## Tratamento de Erros

```
Token inválido → execute: lumi login --token <token>
Sem conexão    → verifique: lumi status
Gateway offline → execute: lumi gateway start
Problema config → execute: lumi doctor
```

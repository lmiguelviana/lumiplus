# Segurança — Lumi Plus
Versão: 2.0

---

## 1. Autenticação

### JWT com Rotação de Refresh Token

```
access_token:  validade 15 minutos
refresh_token: validade 7 dias, rotação a cada uso
```

**Payload do JWT:**
```json
{
  "sub": "user_uuid",
  "tenant_id": "tenant_uuid",
  "role": "owner",
  "jti": "token_uuid_único",
  "iat": 1234567890,
  "exp": 1234568790
}
```

**Rotação:** a cada uso do refresh_token, um novo par é emitido e o anterior é invalidado imediatamente.

### Revogação de Sessão

Lista negra de JTIs no Redis com TTL igual ao access_token:
```
redis.set(`blocked_jti:${jti}`, 1, { EX: 900 }) // 15 min
```

Casos de revogação: troca de senha, logout, suspeita de comprometimento.

### OAuth2

Provedores suportados: Google, GitHub.
Fluxo: Authorization Code + PKCE.
Após OAuth, sistema emite JWT próprio — não depende de token OAuth em runtime.

---

## 2. API Tokens (CLI e API)

- Token real: `sk-lumi-` + 32 bytes aleatórios (hex)
- Banco armazena apenas SHA-256 do token + prefixo para exibição
- Token exibido uma única vez no momento da criação
- Revogável individualmente no dashboard

```javascript
// Geração
const rawToken = `sk-lumi-${crypto.randomBytes(32).toString('hex')}`;
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
const tokenPrefix = rawToken.substring(0, 16); // "sk-lumi-abc12345"

// Validação
const hash = crypto.createHash('sha256').update(incomingToken).digest('hex');
const record = await db.api_tokens.findOne({ token_hash: hash });
```

---

## 3. Multi-Tenancy e Isolamento de Dados

### Row-Level Security (PostgreSQL)

**Regra de ouro:** o banco recusa qualquer query que não seja do tenant correto, mesmo se o código tiver bug.

```sql
-- Ativado em TODAS as tabelas
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agents
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**No backend, antes de qualquer query:**
```javascript
await prisma.$executeRaw`
  SELECT set_config('app.current_tenant', ${req.tenant_id}, true)
`;
```

**Regra de desenvolvimento:** nunca fazer query sem antes setar o contexto de tenant. Code review deve rejeitar PRs que ignorem isso.

### Isolamento de Execução de Agentes

- Cada agente executa em job isolado na fila BullMQ
- Timeout máximo por execução: 60 segundos (configurável)
- Limite de tokens por execução: definido pelo plano
- Memory limit por job: 512MB
- Um agente não pode acessar memória ou chaves de outro tenant

---

## 4. Vault de API Keys

API keys dos usuários (OpenRouter, OpenAI, etc.) são criptografadas antes de gravar no banco.

### Criptografia AES-256-GCM

```javascript
const MASTER_KEY = Buffer.from(process.env.VAULT_MASTER_KEY, 'hex'); // 32 bytes, no .env

function encryptKey(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return {
    key_encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    key_iv: iv.toString('base64')
  };
}

function decryptKey(encryptedBase64, ivBase64) {
  const iv = Buffer.from(ivBase64, 'base64');
  const data = Buffer.from(encryptedBase64, 'base64');
  const authTag = data.slice(-16);
  const encrypted = data.slice(0, -16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
}
```

**Regras absolutas:**
- `VAULT_MASTER_KEY` nunca no código, sempre em variável de ambiente
- Chave descriptografada nunca aparece em log
- Descriptografar apenas no momento de usar (não em memória por mais de 1 request)
- Em produção, usar Google Secret Manager ou AWS Secrets Manager para a master key

---

## 5. Proteção de Entrada

### Rate Limiting (Redis)

```javascript
// Por usuário autenticado: 100 req/min
// Por agente (webhook): 50 req/min
// Por IP (sem auth): 20 req/min

const limit = await rateLimiter.consume(userId, 1);
if (limit.remainingPoints < 0) {
  throw new TooManyRequestsError(limit.msBeforeNext);
}
```

Resposta: `HTTP 429` com header `Retry-After`.

### Validação de Input

Toda entrada validada com Zod antes de processar:
```javascript
const CreateAgentSchema = z.object({
  name: z.string().min(1).max(255),
  mission: z.string().max(5000).optional(),
  primary_model: z.string().max(200),
  temperature: z.number().min(0).max(2).optional()
});
```

### Tamanho Máximo de Mensagem

- Mensagem de usuário para agente: máximo 10.000 caracteres
- Upload de documento: máximo 50MB
- Body de webhook: máximo 1MB

### Proteção Contra Prompt Injection

O system prompt do agente usa delimitadores explícitos para separar instruções de conteúdo externo:

```
[SYSTEM INSTRUCTIONS — IMMUTABLE]
{soul e regras do agente}
[END SYSTEM INSTRUCTIONS]

[USER MESSAGE]
{mensagem do usuário}
[END USER MESSAGE]
```

Conteúdo de documentos ou APIs externas é sempre marcado como `[EXTERNAL CONTENT]` — nunca misturado com as instruções do sistema.

---

## 6. Segurança dos Webhooks

### Validação de Assinatura HMAC

Para webhooks de entrada (WhatsApp, Telegram, etc.):

```javascript
function validateWebhookSignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}
```

- Assinatura inválida → rejeita com 401
- Replay attack: validar timestamp dentro de 5 minutos

---

## 7. Comunicação

- HTTPS/TLS 1.3 em todos os endpoints externos
- Certificados via Let's Encrypt (renovação automática com Caddy ou Certbot)
- HSTS habilitado
- Headers de segurança: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`

---

## 8. Audit Log

Tabela `audit_events` — append-only, nunca atualizada ou deletada.

**Eventos que sempre geram audit log:**
- Criação/edição/deleção de agente
- Criação/revogação de API token
- Acesso ou modificação de API keys (vault)
- Login, logout, troca de senha
- Mudança de plano
- Escalada de agente

**Campos obrigatórios:** `tenant_id`, `actor_id`, `action`, `resource`, `resource_id`, `ip_address`, `created_at`

---

## 9. Alertas de Anomalia

Alertas automáticos para o dono do workspace:

- Agente ultrapassou 150% do uso médio de tokens em 1 hora
- 3+ erros consecutivos de IA em menos de 5 minutos
- Login de IP não reconhecido
- API token usado de localização geográfica diferente do usual
- Rate limit atingido repetidamente

---

## 10. Checklist de Deploy Seguro

```
[ ] VAULT_MASTER_KEY definido em secret manager (não em .env de produção)
[ ] JWT_SECRET com mínimo 64 bytes aleatórios
[ ] DATABASE_URL com usuário de baixo privilégio (não superuser)
[ ] Redis com autenticação ativada
[ ] RLS verificado em todas as tabelas (script de auditoria)
[ ] HTTPS ativo com certificado válido
[ ] Headers de segurança configurados no Nginx/Caddy
[ ] Rate limiting ativo
[ ] Logs não contêm tokens, senhas ou chaves
[ ] Backups automáticos do banco configurados
```

---

## 11. Variáveis de Ambiente Obrigatórias

```env
# Nunca commitar no git — usar .env.example como referência
DATABASE_URL=postgresql://user:pass@host:5432/lumiplus
REDIS_URL=redis://:password@host:6379

JWT_SECRET=<64+ bytes hex aleatórios>
JWT_REFRESH_SECRET=<64+ bytes hex diferentes>

VAULT_MASTER_KEY=<32 bytes hex — usar secret manager em produção>

OPENROUTER_API_KEY=sk-or-... # chave padrão do sistema (fallback)

# Opcional — para notificações
PUSH_NOTIFICATION_KEY=...
```

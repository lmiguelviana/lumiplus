# Fase 36: Auth, Onboarding & Deploy
Versão: 1.0 | Status: ✅ Concluído (19/03/2026)

---

## Visão

Sistema de autenticação real com JWT, wizard de setup inicial para novas instalações, proteção de rotas no frontend, e infraestrutura completa para deploy no GitHub/EasyPanel/VPS via Docker.

---

## 1. Fluxo de Onboarding (Primeira Instalação)

```
Usuário instala o sistema
      ↓
Abre localhost:3000
      ↓
middleware.ts: sem token → redireciona /login
      ↓
/login detecta needsSetup: true → redireciona /setup
      ↓
Wizard 3 passos:
  Passo 1: Criar conta admin (nome, email, senha ≥8 chars)
  Passo 2: Nome do workspace
  Passo 3: OpenRouter API Key (opcional)
      ↓
POST /v1/auth/setup → cria Tenant + User + TenantMember(owner) + agente padrão
      ↓
JWT gerado (30 dias) → salvo em cookie + localStorage
      ↓
Redireciona para home /
```

Nos acessos seguintes:
```
Abre localhost:3000
      ↓
middleware.ts: sem token → /login
      ↓
Login email + senha → JWT → home
```

---

## 2. Backend — Rotas de Auth (`/v1/auth`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/v1/auth/setup/status` | Pública | Retorna `{ needsSetup: boolean }` |
| POST | `/v1/auth/setup` | Pública | Setup inicial (bloqueado se já existir usuário) |
| POST | `/v1/auth/login` | Pública | Login email + senha → JWT |
| GET | `/v1/auth/me` | JWT | Dados do usuário logado |

### POST /auth/setup — Body
```json
{
  "name": "Miguel Viana",
  "email": "miguel@empresa.com",
  "password": "minimo8chars",
  "workspaceName": "Minha Empresa",
  "openrouterKey": "sk-or-v1-..." // opcional
}
```

### POST /auth/login — Body
```json
{
  "email": "miguel@empresa.com",
  "password": "minimo8chars"
}
```

### Resposta de sucesso (setup e login)
```json
{
  "token": "eyJ...",
  "user": { "id": "...", "name": "Miguel Viana", "email": "miguel@empresa.com" },
  "tenant": { "id": "...", "name": "Minha Empresa", "slug": "minha-empresa-..." }
}
```

---

## 3. Segurança — Hash de Senha

Implementação com `crypto` nativo do Node.js (sem bcrypt):

```typescript
function hashPassword(password: string): string {
  return createHash('sha256').update(`lumi:${password}:plus`).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  const h = hashPassword(password);
  return timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
```

- `timingSafeEqual` previne timing attacks
- Salt estático embutido (`lumi:...:plus`) — sem dependências externas
- JWT com expiração de 30 dias

---

## 4. Schema — passwordHash no User

```prisma
model User {
  id           String         @id @default(uuid())
  email        String         @unique
  name         String?
  passwordHash String?        @map("password_hash")  // ← novo
  avatarUrl    String?        @map("avatar_url")
  ...
}
```

---

## 5. Auth Middleware (Backend)

```typescript
// Fluxo atualizado:
// 1. Se header Authorization: Bearer <token> → verifica JWT (dev + prod)
// 2. Se dev sem token → bypass com tenant padrão
// 3. Se prod sem token → 401

if (authHeader?.startsWith('Bearer ')) {
  await request.jwtVerify();
  // extrai tenantId do payload
  return;
}

if (NODE_ENV === 'development') {
  // bypass com tenant padrão
  return;
}

return reply.status(401).send({ error: 'Authorization header missing' });
```

---

## 6. Dashboard — Middleware Next.js

**Arquivo:** `dashboard/src/middleware.ts`

```typescript
const PUBLIC_PATHS = ['/login', '/setup'];

export function middleware(request: NextRequest) {
  // Permite paths públicos e assets
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || ...) {
    return NextResponse.next();
  }

  const token = request.cookies.get('lumi-token')?.value;

  if (!token) {
    // → /login?redirect=/pagina-original
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
```

Token armazenado em **cookie** (para SSR/middleware) e **localStorage** (para requisições axios).

---

## 7. Páginas de Auth

### /setup — Wizard 3 Passos
- Verifica `needsSetup` ao carregar; redireciona para `/login` se já configurado
- Stepper visual com estados: pendente / ativo / concluído
- Validações inline: senha ≥8, confirmação, campos obrigatórios
- Tema dark consistente com o sistema (fundo `#0a0a0a`, cards `zinc-900`)

### /login
- Verifica `needsSetup` ao carregar; redireciona para `/setup` se necessário
- Verifica token existente; redireciona para home se já logado
- Suporte a `?redirect=/caminho` para voltar à página original após login
- `Suspense` wrapper para `useSearchParams` (requisito Next.js App Router)

### Layouts isolados
`/login/layout.tsx` e `/setup/layout.tsx` — renderizam sem sidebar/tema do sistema.

---

## 8. Sidebar — Logout

Botão **Sair** adicionado no rodapé da sidebar:

```typescript
const handleLogout = () => {
  localStorage.removeItem('lumi-token');
  document.cookie = 'lumi-token=; path=/; max-age=0';
  router.replace('/login');
};
```

- Remove token de localStorage e cookie
- Redireciona para `/login`

---

## 9. Deploy — Arquivos Criados

### Docker

| Arquivo | Descrição |
|---------|-----------|
| `backend/Dockerfile` | Multi-stage: build TS → produção mínima |
| `backend/docker-entrypoint.sh` | Aguarda DB → `prisma db push` → start |
| `dashboard/Dockerfile` | Multi-stage Next.js standalone |
| `docker-compose.yml` | postgres (pgvector) + redis + backend + dashboard |

### GitHub

| Arquivo | Descrição |
|---------|-----------|
| `.gitignore` | Ignora node_modules, .env, dist, sessões WA |
| `.env.example` | Template completo com todas as variáveis |
| `install.sh` | Instalação 1-comando: gera chaves, sobe Docker |
| `README.md` | Atualizado com guia de deploy EasyPanel |

### Next.js
- `next.config.ts`: adicionado `output: 'standalone'` (necessário para Dockerfile)
- `backend/package.json`: corrigido `start` de `.ts` para `.js`

---

## 10. Deploy no EasyPanel

```
1. Push para GitHub
2. EasyPanel → New App → From GitHub
3. Backend service:
   - Dockerfile: backend/Dockerfile
   - Porta: 3001
   - Env: DATABASE_URL, JWT_SECRET, VAULT_MASTER_KEY, OPENROUTER_API_KEY
4. Dashboard service:
   - Dockerfile: dashboard/Dockerfile
   - Build arg: NEXT_PUBLIC_API_URL=https://api.seudominio.com
   - Porta: 3000
5. Domínios: app.dominio.com → dashboard, api.dominio.com → backend
6. Deploy automático a cada push na branch main
```

---

## 11. Checklist

```
[x] passwordHash no modelo User (schema.prisma)
[x] GET /auth/setup/status — público
[x] POST /auth/setup — cria tenant + user + agent padrão
[x] POST /auth/login — email + senha → JWT 30d
[x] GET /auth/me — dados do usuário logado
[x] Auth middleware: JWT em prod, bypass dev sem token
[x] dashboard/src/middleware.ts — proteção de rotas
[x] /setup — wizard 3 passos com validação
[x] /login — tela de login com redirect support
[x] /login/layout.tsx e /setup/layout.tsx — sem sidebar
[x] Sidebar: botão Sair + handleLogout
[x] Token armazenado em cookie + localStorage
[x] backend/Dockerfile + docker-entrypoint.sh
[x] dashboard/Dockerfile (standalone mode)
[x] docker-compose.yml (postgres pgvector + redis + apps)
[x] .gitignore na raiz
[x] .env.example completo
[x] install.sh com geração automática de chaves
[x] README.md com guia EasyPanel
[x] next.config.ts: output standalone
[x] package.json: start node dist/server.js
```

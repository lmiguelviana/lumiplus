import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { createHash, timingSafeEqual } from 'crypto';

// Hash simples com SHA-256 + salt embutido (sem bcrypt para não adicionar deps)
function hashPassword(password: string): string {
  return createHash('sha256').update(`lumi:${password}:plus`).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  const h = hashPassword(password);
  try {
    return timingSafeEqual(Buffer.from(h), Buffer.from(hash));
  } catch {
    return false;
  }
}

export async function authRoutes(server: FastifyInstance) {

  /** GET /auth/setup/status — verifica se o sistema precisa de setup inicial */
  server.get('/setup/status', async () => {
    const userCount = await prisma.user.count();
    return { needsSetup: userCount === 0 };
  });

  /** POST /auth/setup — setup inicial: cria tenant + admin + configurações */
  server.post('/setup', async (request, reply) => {
    // Bloqueia se já existe algum usuário
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return reply.status(400).send({ error: 'Sistema já configurado. Use /auth/login.' });
    }

    const { name, email, password, workspaceName, openrouterKey } = request.body as any;

    if (!name || !email || !password || !workspaceName) {
      return reply.status(400).send({ error: 'Campos obrigatórios: name, email, password, workspaceName' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Senha deve ter pelo menos 8 caracteres' });
    }

    // 1. Cria o tenant (workspace)
    const slug = workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const tenant = await prisma.tenant.create({
      data: { name: workspaceName, slug: `${slug}-${Date.now()}`, planTier: 'pro' },
    });

    // 2. Cria o usuário admin
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        passwordHash: hashPassword(password),
      },
    });

    // 3. Vincula como owner do workspace
    await prisma.tenantMember.create({
      data: { tenantId: tenant.id, userId: user.id, role: 'owner' },
    });

    // 4. Salva OpenRouter key se fornecida
    if (openrouterKey?.trim()) {
      const { settingsService } = await import('../services/settings.service.js');
      await settingsService.set(tenant.id, 'openrouter_api_key', openrouterKey.trim(), true);
    }

    // 5. Cria agente padrão "Lumi Helper"
    await prisma.agent.create({
      data: {
        tenantId: tenant.id,
        name: 'Lumi Helper',
        slug: 'lumi-helper',
        mission: 'Assistente principal do workspace',
        systemPrompt: 'Você é o Lumi Helper, assistente inteligente deste workspace. Ajude o usuário com qualquer tarefa.',
        primaryModel: 'google/gemini-2.0-flash-001',
      },
    }).catch(() => {}); // Ignora se já existir

    // 6. Gera JWT
    const token = await reply.jwtSign(
      { tenantId: tenant.id, userId: user.id, role: 'owner' },
      { expiresIn: '30d' }
    );

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  });

  /** POST /auth/login */
  server.post('/login', async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        tenants: {
          include: { tenant: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'Email ou senha inválidos' });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return reply.status(401).send({ error: 'Email ou senha inválidos' });
    }

    if (!user.tenants.length) {
      return reply.status(403).send({ error: 'Usuário sem workspace associado' });
    }

    // Usa o primeiro tenant (owner) ou o que tiver role owner
    const membership = user.tenants.find(t => t.role === 'owner') || user.tenants[0];
    const tenant = membership.tenant;

    const token = await reply.jwtSign(
      { tenantId: tenant.id, userId: user.id, role: membership.role },
      { expiresIn: '30d' }
    );

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  });

  /** GET /auth/me — retorna dados do usuário logado */
  server.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId, tenantId, role } = request.user as any;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, avatarUrl: true },
      });
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, planTier: true },
      });

      return { user, tenant, role };
    } catch {
      return reply.status(401).send({ error: 'Token inválido' });
    }
  });
}

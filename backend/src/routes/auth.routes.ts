import { randomUUID, createHash, timingSafeEqual } from 'crypto';
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
}

function hashPassword(password: string): string {
  return createHash('sha256').update(`lumi:${password}:plus`).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  const hashedPassword = hashPassword(password);

  try {
    return timingSafeEqual(Buffer.from(hashedPassword), Buffer.from(hash));
  } catch {
    return false;
  }
}

async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const users = await prisma.$queryRaw<AuthUserRow[]>`
    SELECT
      id,
      email,
      name,
      password_hash AS "passwordHash",
      avatar_url AS "avatarUrl"
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  return users[0] ?? null;
}

export async function authRoutes(server: FastifyInstance) {
  server.get('/setup/status', async () => {
    const userCount = await prisma.user.count();
    return { needsSetup: userCount === 0 };
  });

  server.post('/setup', async (request, reply) => {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return reply.status(400).send({ error: 'Sistema ja configurado. Use /auth/login.' });
    }

    const { name, email, password, workspaceName, openrouterKey } = request.body as {
      name?: string;
      email?: string;
      password?: string;
      workspaceName?: string;
      openrouterKey?: string;
    };

    if (!name || !email || !password || !workspaceName) {
      return reply
        .status(400)
        .send({ error: 'Campos obrigatorios: name, email, password, workspaceName' });
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Senha deve ter pelo menos 8 caracteres' });
    }

    const slug = workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const tenant = await prisma.tenant.create({
      data: {
        name: workspaceName,
        slug: `${slug}-${Date.now()}`,
        planTier: 'pro',
      },
    });

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();
    const passwordHash = hashPassword(password);
    const userId = randomUUID();
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES (${userId}, ${normalizedEmail}, ${trimmedName}, ${passwordHash}, ${now}, ${now})
    `;

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return reply.status(500).send({ error: 'Falha ao criar usuario admin' });
    }

    await prisma.tenantMember.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'owner',
      },
    });

    if (openrouterKey?.trim()) {
      const { settingsService } = await import('../services/settings.service.js');
      await settingsService.set(tenant.id, 'openrouter_key', openrouterKey.trim(), true);
    }

    const defaultAgent = await prisma.agent.create({
      data: {
        tenantId: tenant.id,
        name: 'Lumi Helper',
        slug: 'lumi-helper',
        mission: 'Assistente principal do workspace',
        systemPrompt:
          'Voce e o Lumi Helper, assistente inteligente deste workspace. Ajude o usuario com qualquer tarefa.',
        primaryModel: 'google/gemini-2.0-flash-001',
      },
    }).catch(() => null);

    if (defaultAgent?.id) {
      const { SkillRegistry } = await import('../services/skills/registry.js');
      await SkillRegistry.activateDefaults(tenant.id, defaultAgent.id).catch(() => {});
    }

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

  server.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email e senha sao obrigatorios' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await findUserByEmail(normalizedEmail);

    if (!user?.passwordHash) {
      return reply.status(401).send({ error: 'Email ou senha invalidos' });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return reply.status(401).send({ error: 'Email ou senha invalidos' });
    }

    const memberships = await prisma.tenantMember.findMany({
      where: { userId: user.id },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!memberships.length) {
      return reply.status(403).send({ error: 'Usuario sem workspace associado' });
    }

    const membership = memberships.find((item) => item.role === 'owner') || memberships[0];
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

  server.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      const { userId, tenantId, role } = request.user as {
        userId: string;
        tenantId: string;
        role: string;
      };

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
      return reply.status(401).send({ error: 'Token invalido' });
    }
  });
}

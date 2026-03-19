/**
 * Setup global dos testes — mocks de Prisma e env.
 */

import { vi } from 'vitest';

// Mock do Prisma para não precisar de banco real
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    agentSkill: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeDocument: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Variáveis de ambiente mínimas
process.env.JWT_SECRET = 'test-secret-32-chars-long-enough!';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

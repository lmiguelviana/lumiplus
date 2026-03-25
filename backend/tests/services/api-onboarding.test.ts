import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    agentSkill: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/services/knowledge.service.js', () => ({
  KnowledgeService: {
    save: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../src/services/settings.service.js', () => ({
  settingsService: {
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from '../../src/lib/prisma.js';
import { KnowledgeService } from '../../src/services/knowledge.service.js';
import { settingsService } from '../../src/services/settings.service.js';
import { ApiOnboardingService } from '../../src/services/api-onboarding.service.js';

describe('ApiOnboardingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registra documentacao e credencial quando a mensagem contem docs + bearer token', async () => {
    const result = await ApiOnboardingService.maybeHandle('tenant-1', 'agent-1', [
      {
        role: 'user',
        content: `instale essa API\nDOCUMENTACAO DA API GERARTHUMBS\nENDPOINT: POST https://example.supabase.co/functions/v1/admin-api-gateway\nAUTORIZACAO: Authorization: Bearer gt_abc123456789TOKEN\nContent-Type: application/json\nACOES DISPONIVEIS: generate_thumbnail, list_gallery, get_usage\n`.repeat(4),
      },
    ]);

    expect(result?.handled).toBe(true);
    expect(result?.response).toContain('API "GERARTHUMBS" registrada com sucesso.');
    expect(settingsService.set).toHaveBeenCalledWith('tenant-1', 'gerarthumbs_api_key', 'gt_abc123456789TOKEN', true);
    expect(KnowledgeService.save).toHaveBeenCalled();
    expect(prisma.agentSkill.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        skillId: 'custom:gerarthumbs',
        enabled: true,
      }),
    }));
  });

  it('ignora mensagens comuns sem sinais de onboarding', async () => {
    const result = await ApiOnboardingService.maybeHandle('tenant-1', 'agent-1', [
      { role: 'user', content: 'me responde em portugues e resume esse texto' },
    ]);

    expect(result).toBeNull();
    expect(settingsService.set).not.toHaveBeenCalled();
    expect(KnowledgeService.save).not.toHaveBeenCalled();
  });
});

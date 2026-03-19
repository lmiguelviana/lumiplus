/**
 * Testes do SkillRegistry — ativação, desativação e defaults.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    agentSkill: {
      findMany: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

// Mock KnowledgeService (usado pelo learn_from_interaction)
vi.mock('../../src/services/knowledge.service.js', () => ({
  KnowledgeService: { save: vi.fn().mockResolvedValue({}) },
}));

import { SkillRegistry } from '../../src/services/skills/registry.js';
import { prisma } from '../../src/lib/prisma.js';
import { DEFAULT_SKILLS } from '../../src/services/skills/catalog.js';

describe('SkillRegistry', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getActiveSkillIds retorna skills do banco quando existem', async () => {
    (prisma.agentSkill.findMany as any).mockResolvedValue([
      { skillId: 'web_search' },
      { skillId: 'knowledge_search' },
    ]);
    const ids = await SkillRegistry.getActiveSkillIds('tenant-1', 'agent-1');
    expect(ids).toEqual(['web_search', 'knowledge_search']);
  });

  it('getActiveSkillIds ativa defaults quando agente não tem skills', async () => {
    (prisma.agentSkill.findMany as any).mockResolvedValue([]);
    const ids = await SkillRegistry.getActiveSkillIds('tenant-1', 'agent-new');
    // Deve retornar as default skills
    expect(ids).toEqual(expect.arrayContaining(DEFAULT_SKILLS));
  });

  it('activate lança erro se skillId não existe no catálogo', async () => {
    await expect(
      SkillRegistry.activate('tenant-1', 'agent-1', 'skill_inexistente')
    ).rejects.toThrow('Skill "skill_inexistente" não existe no catálogo');
  });

  it('activate chama upsert no banco com dados corretos', async () => {
    await SkillRegistry.activate('tenant-1', 'agent-1', 'web_search', { key: 'test' });
    expect(prisma.agentSkill.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { agentId_skillId: { agentId: 'agent-1', skillId: 'web_search' } },
      create: expect.objectContaining({ skillId: 'web_search', enabled: true }),
    }));
  });

  it('deactivate chama updateMany no banco', async () => {
    await SkillRegistry.deactivate('agent-1', 'web_search');
    expect(prisma.agentSkill.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1', skillId: 'web_search' },
      data: { enabled: false },
    });
  });

  it('execute retorna mensagem de fallback para skill sem handler', async () => {
    const result = await SkillRegistry.execute('skill_sem_handler', {}, {
      tenantId: 'tenant-1', agentId: 'agent-1', credentials: {},
    });
    expect(result).toContain('não tem handler implementado');
  });

});

/**
 * Testes do SkillRegistry — ativação, desativação e defaults.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    agentSkill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

// Mock KnowledgeService (usado pelo learn_from_interaction)
vi.mock('../../src/services/knowledge.service.js', () => ({
  KnowledgeService: { save: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../src/services/settings.service.js', () => ({
  settingsService: {
    get: vi.fn(),
  },
}));

import { SkillRegistry } from '../../src/services/skills/registry.js';
import { prisma } from '../../src/lib/prisma.js';
import { DEFAULT_SKILLS } from '../../src/services/skills/catalog.js';
import { settingsService } from '../../src/services/settings.service.js';

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
    expect(ids).toEqual(expect.arrayContaining(['web_search', 'knowledge_search']));
    expect(ids).toEqual(expect.arrayContaining(DEFAULT_SKILLS));
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

  it('getSystemPromptAdditions inclui instrucoes de APIs customizadas', async () => {
    (prisma.agentSkill.findMany as any).mockResolvedValue([
      {
        skillId: 'custom:gerarthumbs',
        config: {
          apiName: 'Gerar Thumbs',
          credentialKey: 'gerarthumbs_api_key',
          authHeader: 'Authorization',
          authScheme: 'Bearer',
          docsTitle: '[API DOCS] Gerar Thumbs',
          exampleUrl: 'https://api.example.com/functions/v1/admin-api-gateway',
        },
      },
    ]);

    const additions = await SkillRegistry.getSystemPromptAdditions('tenant-1', 'agent-1');
    expect(additions).toContain('API personalizada configurada: Gerar Thumbs');
    expect(additions).toContain('{{gerarthumbs_api_key}}');
    expect(additions).toContain('knowledge_search');
  });

  it('getActiveTools inclui tool dinamica para API customizada', async () => {
    (prisma.agentSkill.findMany as any).mockResolvedValue([
      {
        skillId: 'custom:gerarthumbs',
        config: {
          type: 'custom_api',
          apiName: 'Gerar Thumbs',
          baseUrl: 'https://api.example.com',
          defaultPath: '/functions/v1/admin-api-gateway',
        },
      },
    ]);

    const tools = await SkillRegistry.getActiveTools('tenant-1', 'agent-1');
    expect(tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function: expect.objectContaining({
          name: 'custom_api_gerarthumbs',
        }),
      }),
    ]));
  });

  it('call_api resolve placeholders de credenciais salvas', async () => {
    (settingsService.get as any).mockResolvedValue('secret-token');
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

    const result = await SkillRegistry.execute('call_api', {
      method: 'POST',
      url: 'https://api.example.com/run',
      headers: {
        Authorization: 'Bearer {{gerarthumbs_api_key}}',
      },
      body: {
        token: '{{gerarthumbs_api_key}}',
      },
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {},
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.example.com/run',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
        body: JSON.stringify({ token: 'secret-token' }),
      })
    );
    expect(result).toContain('Status: 200 OK');
  });

  it('execute custom_api injeta auth e monta URL com baseUrl + path', async () => {
    (prisma.agentSkill.findFirst as any).mockResolvedValue({
      skillId: 'custom:gerarthumbs',
      config: {
        type: 'custom_api',
        apiName: 'Gerar Thumbs',
        credentialKey: 'gerarthumbs_api_key',
        authHeader: 'Authorization',
        authScheme: 'Bearer',
        baseUrl: 'https://api.example.com',
        defaultPath: '/functions/v1/admin-api-gateway',
      },
    });
    (settingsService.get as any).mockResolvedValue('secret-token');
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

    const result = await SkillRegistry.execute('custom_api_gerarthumbs', {
      method: 'POST',
      path: '/functions/v1/admin-api-gateway',
      body: { action: 'list_gallery' },
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {},
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.example.com/functions/v1/admin-api-gateway',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
        body: JSON.stringify({ action: 'list_gallery' }),
      })
    );
    expect(result).toContain('Status: 200 OK');
  });
});

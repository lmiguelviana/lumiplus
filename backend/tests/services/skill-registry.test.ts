/**
 * Testes do SkillRegistry — ativação, desativação e defaults.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    agent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    agentSkill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    squadMember: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    squad: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    workflow: {
      findMany: vi.fn().mockResolvedValue([]),
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

  it('evolution_api_v2 aceita number e text como campos diretos em send_text', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ sent: true }),
    });

    const result = await SkillRegistry.execute('evolution_api_v2', {
      action: 'send_text',
      number: '55 (22) 99610-2248',
      text: 'TESTE TESTE 123',
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        evolution_api_url: 'https://evolution.example.com',
        evolution_api_key: 'instance-key',
        evolution_instance: 'brasilvibecoding',
      },
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://evolution.example.com/message/sendText/brasilvibecoding',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'instance-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          number: '5522996102248',
          text: 'TESTE TESTE 123',
        }),
      })
    );
    expect(result).toContain('Status: 200 OK');
  });

  it('evolution_api_v2 prefixa 55 quando o numero brasileiro vem sem DDI', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ sent: true }),
    });

    await SkillRegistry.execute('evolution_api_v2', {
      action: 'send_text',
      number: '22 99610-2248',
      text: 'teste',
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        evolution_api_url: 'https://evolution.example.com',
        evolution_api_key: 'instance-key',
        evolution_instance: 'brasilvibecoding',
      },
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://evolution.example.com/message/sendText/brasilvibecoding',
      expect.objectContaining({
        body: JSON.stringify({
          number: '5522996102248',
          text: 'teste',
        }),
      })
    );
  });

  it('evolution_api_v2 envia mensagem para grupo usando group_jid', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ sent: true }),
    });

    await SkillRegistry.execute('evolution_api_v2', {
      action: 'send_group_text',
      group_jid: '123456789-987654321',
      text: 'mensagem para grupo',
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        evolution_api_url: 'https://evolution.example.com',
        evolution_api_key: 'instance-key',
        evolution_instance: 'brasilvibecoding',
      },
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://evolution.example.com/message/sendText/brasilvibecoding',
      expect.objectContaining({
        body: JSON.stringify({
          number: '123456789-987654321@g.us',
          text: 'mensagem para grupo',
        }),
      })
    );
  });

  it('evolution_api_v2 lista grupos com getParticipants opcional', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ groups: [] }),
    });

    await SkillRegistry.execute('evolution_api_v2', {
      action: 'list_groups',
      get_participants: true,
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        evolution_api_url: 'https://evolution.example.com',
        evolution_api_key: 'instance-key',
        evolution_instance: 'brasilvibecoding',
      },
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://evolution.example.com/group/fetchAllGroups/brasilvibecoding?getParticipants=true',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('evolution_api_v2 consulta info de grupo usando group_jid', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ groupJid: '123@g.us' }),
    });

    await SkillRegistry.execute('evolution_api_v2', {
      action: 'get_group_info',
      group_jid: '123@g.us',
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        evolution_api_url: 'https://evolution.example.com',
        evolution_api_key: 'instance-key',
        evolution_instance: 'brasilvibecoding',
      },
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://evolution.example.com/group/findGroupInfos/brasilvibecoding?groupJid=123%40g.us',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('meta_tags_optimizer gera bloco html com title e description', async () => {
    const result = await SkillRegistry.execute('meta_tags_optimizer', {
      primary_keyword: 'automacao de marketing',
      target_audience: 'equipes comerciais',
      primary_cta: 'Teste agora',
      unique_value_prop: 'mais velocidade operacional e melhor conversao',
      brand_name: 'Lumi Plus',
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {},
    });

    expect(result).toContain('<title>');
    expect(result).toContain('<meta name="description"');
    expect(result).toContain('automacao de marketing');
  });

  it('meta_ads_manage exige confirm=true', async () => {
    const result = await SkillRegistry.execute('meta_ads_manage', {
      action: 'set_campaign_status',
      campaign_id: '123',
      status: 'PAUSED',
      confirm: false,
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        meta_access_token: 'meta-token',
        meta_ad_account_id: '12345',
      },
    });

    expect(result).toContain('confirm=true');
  });

  it('meta_ads_read monta URL de campaigns com act_ prefix', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ data: [] }),
    });

    await SkillRegistry.execute('meta_ads_read', {
      action: 'list_campaigns',
      limit: 5,
    }, {
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      credentials: {
        meta_access_token: 'meta-token',
        meta_ad_account_id: '12345',
      },
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.facebook.com/v25.0/act_12345/campaigns'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer meta-token',
        }),
      })
    );
  });
});

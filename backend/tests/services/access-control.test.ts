import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    agent: {
      findUnique: vi.fn(),
    },
    accessRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { AccessControlService } from '../../src/services/access-control.service.js';
import { prisma } from '../../src/lib/prisma.js';

const mockAgent = (overrides: any = {}) => ({
  tenantId: 'tenant-1',
  accessMode: 'open',
  accessAllowlist: [],
  accessBlocklist: [],
  ...overrides,
});

describe('AccessControlService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('modo open: permite qualquer um', async () => {
    (prisma.agent.findUnique as any).mockResolvedValue(mockAgent({ accessMode: 'open' }));

    const result = await AccessControlService.checkAccess('agent-1', 'sender-1', 'whatsapp');
    expect(result).toBe('allowed');
  });

  it('modo disabled: bloqueia todos', async () => {
    (prisma.agent.findUnique as any).mockResolvedValue(mockAgent({ accessMode: 'disabled' }));

    const result = await AccessControlService.checkAccess('agent-1', 'sender-1', 'whatsapp');
    expect(result).toBe('blocked');
  });

  it('modo allowlist: permite quem está na lista', async () => {
    (prisma.agent.findUnique as any).mockResolvedValue(mockAgent({
      accessMode: 'allowlist',
      accessAllowlist: ['sender-1', 'sender-2'],
    }));

    const allowed = await AccessControlService.checkAccess('agent-1', 'sender-1', 'whatsapp');
    expect(allowed).toBe('allowed');

    const blocked = await AccessControlService.checkAccess('agent-1', 'sender-3', 'whatsapp');
    expect(blocked).toBe('blocked');
  });

  it('blocklist tem prioridade sobre open', async () => {
    (prisma.agent.findUnique as any).mockResolvedValue(mockAgent({
      accessMode: 'open',
      accessBlocklist: ['spammer-1'],
    }));

    const blocked = await AccessControlService.checkAccess('agent-1', 'spammer-1', 'whatsapp');
    expect(blocked).toBe('blocked');

    const allowed = await AccessControlService.checkAccess('agent-1', 'normal-user', 'whatsapp');
    expect(allowed).toBe('allowed');
  });

  it('modo pairing: retorna pending se não aprovado', async () => {
    (prisma.agent.findUnique as any).mockResolvedValue(mockAgent({ accessMode: 'pairing' }));
    (prisma.accessRequest.findUnique as any).mockResolvedValue(null);
    (prisma.accessRequest.create as any).mockResolvedValue({});

    const result = await AccessControlService.checkAccess('agent-1', 'new-user', 'telegram');
    expect(result).toBe('pending');
  });

  it('shouldRespondInGroup: modo always', () => {
    const agent = { groupEnabled: true, groupActivation: 'always', name: 'Bot' };
    const result = AccessControlService.shouldRespondInGroup(agent, {
      text: 'qualquer mensagem', isGroup: true, agentName: 'Bot',
    });
    expect(result).toBe(true);
  });

  it('shouldRespondInGroup: modo mention', () => {
    const agent = { groupEnabled: true, groupActivation: 'mention', name: 'Thulio', groupMentionPatterns: ['bot'] };

    const mentioned = AccessControlService.shouldRespondInGroup(agent, {
      text: 'ei thulio, me ajuda', isGroup: true, agentName: 'Thulio',
    });
    expect(mentioned).toBe(true);

    const notMentioned = AccessControlService.shouldRespondInGroup(agent, {
      text: 'alguém sabe o horário?', isGroup: true, agentName: 'Thulio',
    });
    expect(notMentioned).toBe(false);
  });

  it('shouldRespondInGroup: não responde se desativado', () => {
    const agent = { groupEnabled: false };
    const result = AccessControlService.shouldRespondInGroup(agent, {
      text: '@thulio ajuda', isGroup: true, agentName: 'Thulio',
    });
    expect(result).toBe(false);
  });
});

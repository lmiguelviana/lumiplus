import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { AIService } from '../services/ai.service.js';
import { WorkflowRunnerService } from '../services/workflow-runner.service.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';


export default async function workflowRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Lista todos os workflows
  fastify.get('/', async (request, reply) => {
    const { tenantId } = request.user as any;
    const workflows = await prisma.workflow.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ workflows });
  });

  // Um workflow por ID (para carregar canvas) — registrado depois de rotas mais específicas
  // Atualiza workflow (definition = canvas nodes/edges)
  fastify.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const body = request.body as { definition?: { nodes: any[]; edges: any[] }; name?: string; description?: string };
    const workflow = await prisma.workflow.findUnique({
      where: { id, tenantId }
    });
    if (!workflow) return reply.status(404).send({ error: 'Workflow não encontrado' });

    const updateData: any = {};
    if (body.definition != null) updateData.definition = body.definition;
    if (body.name != null) updateData.name = body.name;
    if (body.description != null) updateData.description = body.description;

    const updated = await prisma.workflow.update({
      where: { id },
      data: updateData
    });
    return reply.send({ workflow: updated });
  });

  // Cria um workflow vazio
  fastify.post('/', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { name, description, trigger, definition } = request.body as any;

    const workflow = await prisma.workflow.create({
      data: {
        tenantId,
        name: name || 'Novo Workflow',
        description: description || '',
        trigger: trigger || { type: 'manual' },
        definition: definition || { nodes: [], edges: [] },
        status: 'active',
      }
    });
    return reply.status(201).send({ workflow });
  });

  // chat2workflow: Cria um workflow a partir de uma conversa
  fastify.post('/chat2workflow', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { prompt, name } = request.body as { prompt: string, name?: string };

    if (!prompt) {
      return reply.status(400).send({ error: 'Prompt é obrigatório.' });
    }

    // Usar a inteligência mestre global (Lumi Architect)
    // Procuramos um agente existente do tipo 'router' ou usamos um hardcoded fallback
    let architectId = '';
    const architectAgent = await prisma.agent.findFirst({
      where: { tenantId, slug: 'lumi-architect' }
    });
    if (architectAgent) architectId = architectAgent.id;

    // Nós simulamos a IA do arquiteto para desenhar a estrutura de dados JSON.
    const systemInstruction = `
Você é o Lumi Architect, uma inteligência especializada em converter requisições de automação do usuário em definições JSON estritas de Workflows.
REGRAS:
1. Retorne APENAS um bloco JSON válido. NENHUM texto Markdown adicional (sem \`\`\`json).
2. A estrutura do JSON DEVE ser:
{
  "name": "Nome sugerido",
  "description": "Uma frase",
  "trigger": { "type": "manual" },
  "definition": {
    "nodes": [
      { "id": "start", "type": "system", "prompt": "" },
      { "id": "node_1", "type": "agent_task", "prompt": "Instrução específica", "agentId": null }
    ],
    "edges": [
      { "source": "start", "target": "node_1" }
    ]
  }
}
3. Tipos de nodes suportados: 'agent_task' (tarefa 1-a-1), 'squad_task' (se a tarefa for muito ampla), 'human_approval'.
    `;

    try {
      const gpt4Response = await AIService.complete(tenantId, architectId || 'bypassed', [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ], ['openai/gpt-4o']);

      let jsonContent = gpt4Response.content.trim();
      
      // Limpeza robusta de Markdown
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }

      console.log('[Chat2Workflow] Prompt:', prompt);
      console.log('[Chat2Workflow] AI Response Content:', jsonContent);

      const workflowData = JSON.parse(jsonContent);

      const workflow = await prisma.workflow.create({
        data: {
          tenantId,
          name: name || workflowData.name || 'Novo Workflow Autônomo',
          description: workflowData.description || 'Criado via Chat2Workflow',
          trigger: workflowData.trigger || { type: 'manual' },
          definition: workflowData.definition,
          status: 'active'
        }
      });

      console.log('[Chat2Workflow] Sucesso:', workflow.id);
      return reply.status(201).send({ workflow, rawResponse: gpt4Response.content });

    } catch (err: any) {
      console.error('[Chat2Workflow] ERRO CRÍTICO:', err);
      return reply.status(500).send({ 
        error: 'Erro na arquitetura: ' + (err.message || 'Erro Desconhecido'),
        status: 'error',
        details: err.stack
      });
    }
  });

  // Endpoints operacionais
  fastify.post('/:id/run', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const inputPayload = request.body || {};

    const workflow = await prisma.workflow.findUnique({ where: { id, tenantId } });
    if (!workflow) return reply.status(404).send({ error: 'Nenhum workflow' });

    const run = await WorkflowRunnerService.triggerWorkflow(tenantId, workflow.id, inputPayload);
    return reply.status(202).send({ runId: run.id, status: 'running' });
  });

  // Retomar após Human Approval
  fastify.post('/runs/:runId/resume', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { runId } = request.params as { runId: string };
    const approvalData = request.body || {};

    try {
      const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!run || run.tenantId !== tenantId) {
        return reply.status(404).send({ error: 'Run não encontrado.' });
      }
      await WorkflowRunnerService.resumeWorkflow(runId, approvalData);
      return reply.send({ success: true, status: 'running' });
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }
  });

  // Aprovar uma aprovação pendente
  fastify.post('/approvals/:id/approve', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const approval = await prisma.humanApproval.findFirst({ where: { id, tenantId, status: 'pending' } });
    if (!approval) return reply.status(404).send({ error: 'Aprovação não encontrada ou já processada.' });

    await prisma.humanApproval.update({ where: { id }, data: { status: 'approved' } });
    await WorkflowRunnerService.resumeWorkflow(approval.runId);
    return reply.send({ ok: true, message: 'Aprovado! Workflow retomado.' });
  });

  // Rejeitar uma aprovação pendente
  fastify.post('/approvals/:id/reject', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const approval = await prisma.humanApproval.findFirst({ where: { id, tenantId, status: 'pending' } });
    if (!approval) return reply.status(404).send({ error: 'Aprovação não encontrada ou já processada.' });

    await prisma.humanApproval.update({ where: { id }, data: { status: 'rejected' } });
    await prisma.workflowRun.update({
      where: { id: approval.runId },
      data: { status: 'failed', error: 'Rejeitado pelo aprovador', endedAt: new Date() }
    });
    return reply.send({ ok: true, message: 'Rejeitado. Workflow cancelado.' });
  });

  // Listar aprovações pendentes
  fastify.get('/approvals/pending', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const approvals = await prisma.humanApproval.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { run: { select: { id: true, status: true, workflow: { select: { name: true } } } } }
    });
    return reply.send({ approvals });
  });

  // Visualizar status das execuções (rota mais específica antes de GET /:id)
  fastify.get('/:id/runs', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const runs = await prisma.workflowRun.findMany({
      where: { tenantId, workflowId: id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return reply.send({ runs });
  });

  // Deletar workflow e seus dados relacionados
  fastify.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    const workflow = await prisma.workflow.findUnique({ where: { id, tenantId } });
    if (!workflow) return reply.status(404).send({ error: 'Workflow não encontrado' });

    // Deletar em cascata: approvals → tasks → runs → workflow
    const runs = await prisma.workflowRun.findMany({ where: { workflowId: id }, select: { id: true } });
    const runIds = runs.map(r => r.id);

    if (runIds.length > 0) {
      await prisma.humanApproval.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.spawnedAgent.deleteMany({ where: { workflowRunId: { in: runIds } } });
      await prisma.workflowTask.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.workflowRun.deleteMany({ where: { workflowId: id } });
    }

    await prisma.workflow.delete({ where: { id } });
    return reply.send({ ok: true });
  });

  // Um workflow por ID (para carregar canvas)
  fastify.get('/:id', async (request, reply) => {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const workflow = await prisma.workflow.findUnique({
      where: { id, tenantId }
    });
    if (!workflow) return reply.status(404).send({ error: 'Workflow não encontrado' });
    return reply.send({ workflow });
  });
}

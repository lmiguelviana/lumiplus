import { prisma } from '../lib/prisma.js';
import { AIService } from './ai.service.js';
import { KnowledgeService } from './knowledge.service.js';
import { workflowEvents } from '../lib/ws-events.js';


export class SwarmService {
  /**
   * Executa uma tarefa de squad orquestrando o Líder e seus Funcionários.
   * Fluxo: Líder recebe objetivo → delega via tool calls → funcionários executam → Líder consolida
   * Após execução: salva resultado na memória semântica do líder (AgentKnowledge).
   */
  static async executeSquadTask(
    tenantId: string,
    squadId: string,
    inputTask: string,
    runId?: string
  ): Promise<string> {
    if (!squadId) throw new Error('[Swarm] squadId não fornecido.');

    const squad = await prisma.squad.findUnique({
      where: { id: squadId, tenantId },
      include: {
        members: {
          include: {
            agent: {
              select: {
                id: true, name: true, slug: true, mission: true,
                systemPrompt: true, primaryModel: true, fallbackModels: true
              }
            }
          }
        }
      }
    });

    if (!squad) throw new Error(`[Swarm] Squad ${squadId} não encontrada.`);
    if (squad.members.length === 0) throw new Error('[Swarm] Squad sem membros.');

    // Identificar líder e funcionários
    const leaderMember = squad.members.find(m => m.role === 'leader') || squad.members[0];
    const leader = leaderMember.agent;
    const workers = squad.members
      .filter(m => m.id !== leaderMember.id)
      .map(m => m.agent);

    console.log(`[Swarm] Squad "${squad.name}" — Líder: ${leader.name} | Funcionários: ${workers.map(w => w.name).join(', ') || 'nenhum'}`);

    // Emite status "running" do líder para o canvas via WebSocket
    workflowEvents.emit('agent_status', {
      tenantId, agentId: leader.id, status: 'running', runId, squadId
    });

    // Buscar chave API
    const { settingsService } = await import('./settings.service.js');
    let apiKey = await settingsService.get(tenantId, 'openrouter_key');
    try {
      const customKey = await prisma.agentApiKey.findFirst({
        where: { tenantId, OR: [{ agentId: leader.id }, { agentId: null }], provider: 'openrouter' },
        orderBy: { agentId: 'desc' }
      });
      if (customKey) {
        const { vaultService } = await import('./vault.service.js');
        apiKey = vaultService.decrypt(customKey.keyEncrypted);
      }
    } catch (_) { /* usa chave global */ }

    // RAG: busca contexto na memória do líder antes de começar
    let ragContext = '';
    try {
      const ragResults = await KnowledgeService.search(tenantId, leader.id, inputTask, 5);
      if (ragResults.length > 0) {
        ragContext = '\n\nCONTEXTO DA MEMÓRIA DA SQUAD (use para enriquecer a resposta):\n'
          + ragResults.map((r, i) => `[${i + 1}] ${r.content}`).join('\n\n');
      }
    } catch (_) { /* RAG opcional */ }

    // Busca SOUL.md do líder (identidade avançada definida pelo usuário)
    let leaderSoulMd = '';
    try {
      const soulMd = await KnowledgeService.getSoul(tenantId, leader.id);
      if (soulMd) leaderSoulMd = `\n\n## ALMA DO LÍDER (SOUL.md)\n${soulMd}`;
    } catch (_) {}

    // System prompt do líder com Soul + membros da squad
    const leaderSoul = leader.systemPrompt || leader.mission || `Você é o líder da squad "${squad.name}".`;
    const workersDescription = workers.length > 0
      ? `\n\nSUA EQUIPE ESPECIALISTA:\n${workers.map(w => `- ${w.name} (@${w.slug}): ${w.mission || 'Especialista da squad'}`).join('\n')}`
      : '\n\nVocê é o único membro desta squad.';

    const leaderSystemPrompt = `${leaderSoul}${leaderSoulMd}${workersDescription}

REGRAS DE ORQUESTRAÇÃO:
1. Analise a tarefa e use as tools para delegar partes específicas aos seus especialistas.
2. Sintetize os resultados recebidos em uma resposta final coesa.
3. Se a tarefa for simples e você mesmo puder resolver, não precisa delegar.
4. Responda sempre em português (Brasil).${ragContext}`;

    // Preparar workers como tools para o líder
    const workerTools = workers.map(worker => ({
      type: 'function',
      function: {
        name: `delegate_to_${worker.slug.replace(/-/g, '_')}`,
        description: `Delegar sub-tarefa para ${worker.name}: ${worker.mission || 'Especialista da squad'}`,
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'Descrição detalhada da sub-tarefa que este especialista deve executar.'
            }
          },
          required: ['task']
        }
      }
    }));

    const messages: any[] = [
      { role: 'system', content: leaderSystemPrompt },
      { role: 'user', content: inputTask }
    ];

    const leaderModels = [
      leader.primaryModel || 'openai/gpt-4o',
      ...(leader.fallbackModels as string[] || []),
      'anthropic/claude-3.5-sonnet',
    ].filter(Boolean).slice(0, 3);

    let isTaskDone = false;
    let finalResponse = '';
    let loopCount = 0;
    const MAX_LOOPS = 6;
    const executionLog: string[] = [`🎯 Objetivo: ${inputTask}`];

    while (!isTaskDone && loopCount < MAX_LOOPS) {
      loopCount++;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://lumiplus.ai',
          'X-Title': 'Lumi Plus Swarm',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          models: leaderModels,
          messages,
          tools: workerTools.length > 0 ? workerTools : undefined,
          tool_choice: workerTools.length > 0 ? 'auto' : undefined,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`[Swarm] OpenRouter error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const message = data.choices[0].message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);
        executionLog.push(`\n🧠 Líder delegou ${message.tool_calls.length} tarefa(s)...`);

        // Executar workers em paralelo
        const toolResults = await Promise.all(message.tool_calls.map(async (toolCall: any) => {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || '{}');
          const workerSlug = functionName.replace('delegate_to_', '').replace(/_/g, '-');
          const worker = workers.find(w => w.slug === workerSlug);

          let toolResult = '';
          if (worker) {
            console.log(`[Swarm] → Delegando para ${worker.name}: "${args.task?.slice(0, 80)}..."`);

            // Emite status "running" do worker via WebSocket
            workflowEvents.emit('agent_status', {
              tenantId, agentId: worker.id, status: 'running', runId, squadId
            });

            try {
              // Worker usa seu próprio Soul + RAG
              const workerResponse = await AIService.complete(
                tenantId,
                worker.id,
                [{ role: 'user', content: args.task }]
              );
              toolResult = workerResponse.content;
              executionLog.push(`✅ ${worker.name}: ${toolResult.slice(0, 200)}...`);

              // Emite status "completed" do worker
              workflowEvents.emit('agent_status', {
                tenantId, agentId: worker.id, status: 'completed', runId, squadId
              });
            } catch (err: any) {
              toolResult = `Erro no especialista ${worker.name}: ${err.message}`;
              workflowEvents.emit('agent_status', {
                tenantId, agentId: worker.id, status: 'failed', runId, squadId
              });
            }
          } else {
            toolResult = `Especialista "${workerSlug}" não encontrado na squad.`;
          }

          return {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            name: functionName,
            content: toolResult
          };
        }));

        messages.push(...toolResults);

      } else {
        finalResponse = message.content || 'Execução concluída.';
        isTaskDone = true;
        executionLog.push(`\n🎉 Líder consolidou: ${finalResponse.slice(0, 300)}`);
      }
    }

    if (!isTaskDone) {
      finalResponse = 'Limite de iterações da squad atingido. Resposta parcial disponível.';
    }

    // Emite status "completed" do líder
    workflowEvents.emit('agent_status', {
      tenantId, agentId: leader.id, status: 'completed', runId, squadId
    });

    // Auto-save: salva o log de execução na memória semântica do líder (AgentKnowledge)
    try {
      const executionDate = new Date().toLocaleDateString('pt-BR');
      const executionContent = [
        `# Execução da Squad "${squad.name}" — ${executionDate}`,
        '',
        executionLog.join('\n'),
        '',
        `## Resultado Final`,
        finalResponse
      ].join('\n');

      await KnowledgeService.save(tenantId, leader.id, {
        title: `Execução Squad ${squad.name} — ${executionDate}`,
        content: executionContent
      });
      console.log(`[Swarm] Execução salva na memória do líder ${leader.name}.`);
    } catch (saveErr: any) {
      console.warn('[Swarm] Auto-save de memória falhou (não-fatal):', saveErr.message);
    }

    return finalResponse;
  }
}

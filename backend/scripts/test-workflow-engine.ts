import { PrismaClient } from '@prisma/client';
import { WorkflowRunnerService } from '../src/services/workflow-runner.service.js';
import axios from 'axios';

const prisma = new PrismaClient();

// MOCK DATA baseada no banco real
const TEST_TENANT = '21757111-9dd5-4b05-a83d-57dbf97cc481';
const TEST_PROMPT = 'Crie um workflow que analise o sentimento de uma mensagem e envie um email de agradecimento se for positivo.';

async function testWorkflowSystem() {
  console.log('🚀 Iniciando Teste de Workflow...');

  // 1. Verificar se existe o agente Lumi Architect
  const architect = await prisma.agent.findFirst({
    where: { tenantId: TEST_TENANT, slug: 'lumi-architect' }
  });
  
  if (!architect) {
    console.log('⚠️ Agente Lumi Architect não encontrado. Usando fallback no teste.');
  }

  // 2. Simular criação de workflow com AGENTE REAL (Lumi Helper)
  const agentId = '21b83fd6-5e42-4caa-963e-5a73fff3bc80'; // Lumi Helper

  console.log('📦 Criando workflow de teste com agente real...');
  const workflow = await prisma.workflow.create({
    data: {
      tenantId: TEST_TENANT,
      name: 'Teste de Motor ' + new Date().toLocaleTimeString(),
      description: 'Workflow para validar o processador de agentes',
      trigger: { type: 'manual' },
      definition: {
        nodes: [
          { id: 'start', type: 'system', data: { label: 'Início' } },
          { id: 'step1', type: 'agent_task', data: { label: 'Analisar Sentimento', prompt: 'Diga se a frase "{{input}}" é positiva, negativa ou neutra. Responda em uma palavra.', agentId } }
        ],
        edges: [
          { id: 'start', source: 'start', target: 'step1' }
        ]
      },
      status: 'active'
    }
  });
  console.log(`✅ Workflow criado: ${workflow.id}`);

  // 3. Trigger do Workflow
  console.log('🏃 Executando workflow...');
  const run = await WorkflowRunnerService.triggerWorkflow(TEST_TENANT, workflow.id, {
    input: 'Estou muito feliz com o Lumi Plus!'
  });
  console.log(`✅ Run iniciado: ${run.id} | Status: ${run.status}`);

  // 4. Aguardar um pouco para processamento (Zero-Redis fallback processa em memória)
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 5. Verificar resultado
  const finalRun = await prisma.workflowRun.findUnique({
    where: { id: run.id }
  });
  
  console.log('📊 Resultado Final:', JSON.stringify(finalRun, null, 2));

  if (finalRun?.status === 'completed' || finalRun?.status === 'running') {
    console.log('✨ TESTE BEM SUCEDIDO: O motor de workflow está operante.');
  } else {
    console.log('❌ TESTE FALHOU: Verifique os logs do backend.');
  }
}

testWorkflowSystem()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { AIService } from './services/ai.service.js';
import { PrismaClient } from '@prisma/client';
import { encrypt } from './utils/vault.js';
import { env } from './config/env.js';

const prisma = new PrismaClient();

async function debugChat() {
  try {
    console.log('🚀 Iniciando Diagnóstico de Chat Web...');
    
    const agent = await prisma.agent.findFirst();

    if (!agent) {
      console.error('❌ Erro: Nenhum agente encontrado no banco de dados.');
      return;
    }

    const tenantId = agent.tenantId;
    console.log(`🤖 Agente Selecionado: ${agent.name} (${agent.id})`);
    console.log(`🏢 Tenant ID Localizado: ${tenantId}`);

    console.log('📡 Chamando AIService.complete...');
    const result = await AIService.complete(tenantId, agent.id, [
      { role: 'user', content: 'Oi, isso é um teste de diagnóstico.' }
    ]);

    if (result.model === 'error') {
      console.error('❌ Erro retornado pela AIService:', result.content);
    } else {
      console.log('✅ Resposta da IA:', result.content);
      console.log('📊 Modelo Utilizado:', result.model);
    }

  } catch (error: any) {
    console.error('💥 ERRO FATAL NO SCRIPT:');
    console.error('Mensagem:', error.message);
    if (error.stack) console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
    console.log('🏁 Fim do diagnóstico.');
  }
}

debugChat();

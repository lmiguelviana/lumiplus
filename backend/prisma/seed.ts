import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Semeando banco de dados...');

  // 1. Criar Tenant Padrão
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Lumi Plus Default',
      slug: 'default',
      planTier: 'pro'
    }
  });

  // 2. Criar Agente Padrão (O "Cérebro" do Bot)
  const agent = await prisma.agent.upsert({
    where: { 
      tenantId_slug: {
        tenantId: tenant.id,
        slug: 'lumi-bot'
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Lumi Helper',
      slug: 'lumi-bot',
      mission: 'Ajudar usuários a entender o Lumi Plus e gerenciar seus sistemas.',
      tone: 'Profissional e prestativo',
      personality: 'Especialista em automação e no-code',
      systemPrompt: 'Você é o Lumi Helper, um assistente inteligente. Responda de forma concisa e útil.',
      primaryModel: 'openai/gpt-4o'
    }
  });

  console.log(`✅ Seed concluído!
  - Tenant ID: ${tenant.id}
  - Agent ID: ${agent.id}
  - Agent Slug: ${agent.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

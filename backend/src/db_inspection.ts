import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Inspecionando Banco de Dados...');

  const interactions = await prisma.agentInteraction.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n📊 Últimas Interações:', JSON.stringify(interactions, null, 2));

  const keys = await prisma.agentApiKey.findMany({
    select: { id: true, tenantId: true, provider: true, agentId: true }
  });
  console.log('\n🔑 Chaves de API no Banco:', JSON.stringify(keys, null, 2));

  const tenants = await prisma.tenant.findMany();
  console.log('\n🏢 Tenants:', JSON.stringify(tenants, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

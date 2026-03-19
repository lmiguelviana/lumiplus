import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function getAgent() {
  const agent = await prisma.agent.findFirst({
    where: { deletedAt: null }
  });
  if (agent) {
    console.log('AGENT_ID=' + agent.id);
    console.log('TENANT_ID=' + agent.tenantId);
  } else {
    console.log('No agents found.');
  }
  await prisma.$disconnect();
}

getAgent();

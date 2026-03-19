import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, slug: true, tenantId: true }
  });
  console.log('AGENTS:', JSON.stringify(agents, null, 2));

  const squads = await prisma.squad.findMany({
    select: { id: true, name: true, tenantId: true }
  });
  console.log('SQUADS:', JSON.stringify(squads, null, 2));

  const workflows = await prisma.workflow.findMany({
    select: { id: true, name: true, tenantId: true }
  });
  console.log('WORKFLOWS:', JSON.stringify(workflows, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

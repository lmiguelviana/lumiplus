import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const interactions = await prisma.agentInteraction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  for (const i of interactions) {
    console.log(`\n\n=== Interaction ID: ${i.id} ===`);
    // Print user input
    if (i.input && Array.isArray(i.input)) {
        const userMsg = (i.input as any[]).find(m => m.role === 'user');
        console.log('USER:', userMsg?.content);
        
        const astCalls = (i.input as any[]).filter(m => m.role === 'assistant' && m.tool_calls);
        if (astCalls.length) console.log('TOOL CALLS:', JSON.stringify(astCalls, null, 2));

        const toolResults = (i.input as any[]).filter(m => m.role === 'tool');
        if (toolResults.length) console.log('TOOL RESULTS:', JSON.stringify(toolResults, null, 2));
    }
    
    // Print final output
    const outStr = JSON.stringify(i.output);
    console.log('FINAL OUTPUT:', (i.output as any)?.content || 'NO CONTENT');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const ints = await prisma.agentInteraction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    for (const i of ints) {
        const outStr = JSON.stringify(i.output);
        if (outStr.includes("disponível no momento")) {
            console.log(`\n\n=== ID: ${i.id} ===`);
            const astCalls = (i.input as any[]).filter(m => m.role === 'assistant' && m.tool_calls);
            if (astCalls.length) console.log('TOOL CALLS:', JSON.stringify(astCalls, null, 2));

            const toolResults = (i.input as any[]).filter(m => m.role === 'tool');
            if (toolResults.length) console.log('TOOL RESULTS:', JSON.stringify(toolResults, null, 2));
            
            console.log('OUTPUT:', JSON.stringify(i.output, null, 2));
        }
    }
}
main().finally(() => prisma.$disconnect());

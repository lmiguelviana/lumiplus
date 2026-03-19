import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const agentSlug = 'lumi-bot';
  
  // Encontrar o agente Lumi Helper (ou cria um se não existir)
  let agent = await prisma.agent.findFirst({
    where: { slug: agentSlug }
  });

  if (!agent) {
    // Busca qualquer tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Nenhum tenant encontrado no banco de dados.');
    
    agent = await prisma.agent.create({
      data: {
        id: '21b83fd6-5e42-4caa-963e-5a73fff3bc80',
        tenantId: tenant.id,
        name: 'Lumi Helper',
        slug: agentSlug,
        systemPrompt: 'Placeholder'
      }
    });
    console.log('Agente criado:', agent.id);
  } else {
    console.log('Agente encontrado:', agent.id);
  }

  const rootPath = path.join(process.cwd(), '..');
  const docsPath = path.join(rootPath, 'docs');

  console.log('Lendo arquivos de documentação em:', docsPath);

  const filesRegex = /\.md$/;
  let docsFiles = [];
  if (fs.existsSync(docsPath)) {
    docsFiles = fs.readdirSync(docsPath)
      .filter(f => filesRegex.test(f))
      .map(f => path.join(docsPath, f));
  }

  const rootFiles = ['README.md', 'ARCHITECTURE.md'].map(f => path.join(rootPath, f));
  
  const filesToRead = [...rootFiles, ...docsFiles];

  let combinedDocs = '';
  for (const file of filesToRead) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const content = fs.readFileSync(file, 'utf-8');
      const filename = path.basename(file);
      combinedDocs += `\n\n==================================================\n`;
      combinedDocs += `DOCUMENTO: ${filename}\n`;
      combinedDocs += `==================================================\n\n${content}`;
      console.log(`Lido: ${filename} (${content.length} bytes)`);
    }
  }

  const systemPrompt = `Você é o **Lumi Helper**, o assistente oficial, arquiteto de software e engenheiro especialista da plataforma **Lumi Plus**.
Sua missão é ajudar os usuários a entenderem a arquitetura, implementarem novas funcionalidades, resolverem problemas e dominarem todo o framework Lumi Plus.

Diretrizes de Personalidade e Tom:
1. Você é extramente técnico, mas didático.
2. Você resolve problemas de forma construtiva.
3. Se o usuário quiser criar uma squad, um workflow, ou fazer um deploy, consulte os documentos abaixo e forneça exatamente a resposta baseada neles.
4. Você NUNCA inventa funcionalidades do Lumi Plus que não estão na documentação.

Abaixo está o conteúdo COMPLETO E ATUALIZADO de toda a documentação, arquitetura, manual de comandos e guias de implantação do Lumi Plus em seu escopo de código atual.
Use esta Base de Conhecimento para responder a qualquer pergunta com 100% de exatidão!

--- INÍCIO DA BASE DE CONHECIMENTO LUMI PLUS ---
${combinedDocs}
--- FIM DA BASE DE CONHECIMENTO LUMI PLUS ---
`;

  console.log(`Atualizando soul do agente ${agent.name} (Tamanho do Prompt: ${systemPrompt.length} bytes)...`);

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      mission: 'Servir como Mestre Arquiteto e Guia Oficial para Desenvolvedores do framework Lumi Plus.',
      tone: 'Especialista, Técnico, Didático e Direto.',
      personality: 'Arquiteto Sênior e Engenheiro IA.',
      systemPrompt,
      primaryModel: 'google/gemini-2.0-flash-001', // Excelente janela de contexto longa
    }
  });

  console.log('✅ Agente Lumi Helper injetado com toda a documentação com sucesso!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

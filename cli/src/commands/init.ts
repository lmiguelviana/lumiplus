import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Comando 'lumi init' — Implementa o wizard de inicialização profissional.
 * Automatiza o setup do .env, Prisma e Seed.
 */
export async function initCommand() {
  console.log(chalk.cyan('\n🚀 Lumi Plus — Assistente de Onboarding Profissional\n'));

  const questions = [
    {
      type: 'input',
      name: 'openRouterKey',
      message: 'Insira sua chave da API do OpenRouter:',
      validate: (input: string) => input.length > 10 || 'Uma chave válida é necessária.'
    },
    {
      type: 'list',
      name: 'dbType',
      message: 'Qual banco de dados deseja utilizar?',
      choices: [
        { name: 'SQLite (Mais simples, para testes locais)', value: 'sqlite' },
        { name: 'PostgreSQL / Supabase (Recomendado para Produção)', value: 'postgresql' }
      ]
    },
    {
      type: 'input',
      name: 'dbUrl',
      message: 'URL de conexão (DATABASE_URL):',
      when: (answers: any) => answers.dbType === 'postgresql',
      default: 'postgresql://postgres:postgres@localhost:5432/lumiplus_db?schema=public'
    },
    {
      type: 'input',
      name: 'telegramToken',
      message: 'Token do Bot do Telegram (opcional):',
      default: ''
    },
    {
      type: 'confirm',
      name: 'runMigrations',
      message: 'Deseja configurar o banco de dados e aplicar as migrações agora?',
      default: true
    }
  ];

  const answers = await inquirer.prompt(questions);

  const backendDir = path.resolve(process.cwd(), '../backend');
  const envPath = path.join(backendDir, '.env');
  const prismaSchemaPath = path.join(backendDir, 'prisma/schema.prisma');

  // 1. Atualizar o provider no schema.prisma dinamicamente
  const spinnerSchema = ora('Ajustando provedor do banco de dados...').start();
  try {
    let schemaContent = fs.readFileSync(prismaSchemaPath, 'utf-8');
    const providerRegex = /provider\s*=\s*"[^"]*"/;
    schemaContent = schemaContent.replace(providerRegex, `provider = "${answers.dbType}"`);
    fs.writeFileSync(prismaSchemaPath, schemaContent);
    spinnerSchema.succeed(chalk.green(`Provider Prisma definido como ${answers.dbType}!`));
  } catch (err: any) {
    spinnerSchema.fail(chalk.red(`Falha ao ajustar schema.prisma: ${err.message}`));
    return;
  }

  // 2. Criar o .env com a URL correta
  const spinnerEnv = ora('Gerando arquivo de ambiente...').start();
  
  const finalDbUrl = answers.dbType === 'sqlite' ? 'file:./dev.db' : answers.dbUrl;

  const envContent = `
DATABASE_URL="${finalDbUrl}"
JWT_SECRET="${Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)}"
OPENROUTER_API_KEY="${answers.openRouterKey}"
TELEGRAM_BOT_TOKEN="${answers.telegramToken}"
VAULT_MASTER_KEY="${Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('')}"
PORT=3000
NODE_ENV=development
`.trim();

  try {
    fs.writeFileSync(envPath, envContent);
    spinnerEnv.succeed(chalk.green('Arquivo .env configurado!'));
  } catch (err: any) {
    spinnerEnv.fail(chalk.red(`Falha ao criar .env: ${err.message}`));
    return;
  }

  // 2. Rodar Migrations e Seed se solicitado
  if (answers.runMigrations) {
    const spinnerDb = ora('Configurando banco de dados (Prisma)...').start();
    try {
      execSync('npx prisma migrate dev --name init_onboarding --skip-generate', { cwd: backendDir, stdio: 'inherit' });
      spinnerDb.succeed(chalk.green('Banco de dados sincronizado!'));

      const spinnerSeed = ora('Semeando dados iniciais...').start();
      execSync('npx tsx prisma/seed.ts', { cwd: backendDir, stdio: 'inherit' });
      spinnerSeed.succeed(chalk.green('Agente padrão criado com sucesso!'));
    } catch (err: any) {
      spinnerDb.fail(chalk.red('Falha na configuração do banco. Verifique se o Postgres está rodando.'));
    }
  }

  console.log(chalk.hex('#FF6B35')('\n✅ Onboarding concluído com sucesso!\n'));
  console.log(chalk.bold('Próximos passos:'));
  console.log(`  1. ${chalk.cyan('lumi start')} — Inicia backend + dashboard`);
  console.log(`  2. Acesse ${chalk.cyan('http://localhost:3000')} — Dashboard web`);
  console.log(`  3. ${chalk.cyan('lumi status')} — Verifica saúde do sistema`);
  console.log(`  4. ${chalk.cyan('lumi agents list')} — Ver agentes criados\n`);
}

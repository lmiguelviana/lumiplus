#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { agentsCommand } from './commands/agents.js';
import { skillsCommand } from './commands/skills.js';
import { logsCommand } from './commands/logs.js';

const program = new Command();

console.log(
  boxen(
    chalk.hex('#FF6B35').bold('LUMI PLUS') + chalk.gray(' CLI v2.0.8-PRO-MAX'),
    {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { top: 1, bottom: 0, left: 1, right: 0 },
      borderStyle: 'bold',
      borderColor: '#FF6B35'
    }
  )
);

program
  .name('lumi')
  .description('Orquestração de agentes IA — Multi-Provider, Multi-Canal')
  .version('2.0.8');

// Setup
program
  .command('init')
  .description('Inicializa workspace (banco, .env, agente padrão)')
  .action(initCommand);

program
  .command('start')
  .description('Inicia backend + dashboard')
  .option('-b, --backend-only', 'Inicia apenas o backend')
  .option('-d, --dashboard-only', 'Inicia apenas o dashboard')
  .option('-p, --port <port>', 'Porta do backend', '3001')
  .action(startCommand);

// Monitoramento
program
  .command('status')
  .description('Saúde do sistema (backend, banco, canais, IA)')
  .action(statusCommand);

// Agentes
const agents = program
  .command('agents')
  .description('Gerenciar agentes');

agents
  .command('list')
  .description('Lista todos os agentes')
  .action(() => agentsCommand('list'));

agents
  .command('create <name>')
  .description('Cria um novo agente')
  .option('-m, --mission <mission>', 'Missão do agente')
  .option('--model <model>', 'Modelo de IA', 'google/gemini-2.0-flash-001')
  .action((name, opts) => agentsCommand('create', { name, ...opts }));

// Skills
const skills = program
  .command('skills')
  .description('Gerenciar skills');

skills
  .command('list')
  .description('Lista skills disponíveis')
  .action(() => skillsCommand('list'));

skills
  .command('activate <skillId> <agentId>')
  .description('Ativa uma skill para um agente')
  .action((skillId, agentId) => skillsCommand('activate', { skillId, agentId }));

// Logs
program
  .command('logs')
  .description('Ver últimas interações')
  .option('-n, --limit <n>', 'Número de logs', '10')
  .option('-a, --agent <agentId>', 'Filtrar por agente')
  .action(logsCommand);

program.parse(process.argv);

// Se nenhum comando, mostra help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

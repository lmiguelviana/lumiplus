import chalk from 'chalk';
import ora from 'ora';

const API_URL = process.env.LUMI_API_URL || 'http://localhost:3001/v1';
const TOKEN = process.env.LUMI_TOKEN || '';

const headers = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
});

export async function agentsCommand(action: string, opts?: any) {
  if (!TOKEN) {
    console.log(chalk.yellow('\n⚠️  Configure LUMI_TOKEN no ambiente para autenticar.'));
    console.log(chalk.gray('  export LUMI_TOKEN="seu-jwt-token"\n'));
  }

  if (action === 'list') {
    const spinner = ora('Buscando agentes...').start();
    try {
      const res = await fetch(`${API_URL}/dashboard/agents`, {
        headers: headers(),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        spinner.fail(chalk.red(`Erro ${res.status}: ${await res.text()}`));
        return;
      }

      const agents = await res.json();
      spinner.stop();

      if (!agents?.length) {
        console.log(chalk.yellow('\nNenhum agente encontrado.'));
        return;
      }

      console.log(chalk.hex('#FF6B35')(`\n🤖 ${agents.length} agente(s) encontrado(s):\n`));

      agents.forEach((a: any, i: number) => {
        const status = a.status === 'active' ? chalk.green('● ATIVO') : chalk.red('○ INATIVO');
        const model = a.primaryModel || 'padrão';
        console.log(`  ${chalk.bold(`${i + 1}.`)} ${chalk.bold(a.name)} ${chalk.gray(`@${a.slug}`)} ${status}`);
        console.log(`     ${chalk.gray(`Missão: ${a.mission || '—'}`)}  |  ${chalk.gray(`Modelo: ${model}`)}`);
        console.log(`     ${chalk.gray(`Interações: ${a._count?.interactions || 0}`)}`);
        console.log('');
      });
    } catch (err: any) {
      spinner.fail(chalk.red(`Erro: ${err.message}`));
    }
  }

  if (action === 'create') {
    const spinner = ora(`Criando agente "${opts.name}"...`).start();
    try {
      const res = await fetch(`${API_URL}/dashboard/agents`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          name: opts.name,
          mission: opts.mission || `Agente ${opts.name}`,
          primaryModel: opts.model || 'google/gemini-2.0-flash-001',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        spinner.fail(chalk.red(`Erro ${res.status}: ${await res.text()}`));
        return;
      }

      const agent = await res.json();
      spinner.succeed(chalk.green(`Agente "${agent.name}" criado! ID: ${agent.id}`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Erro: ${err.message}`));
    }
  }
}

import chalk from 'chalk';
import ora from 'ora';

const API_URL = process.env.LUMI_API_URL || 'http://localhost:3001/v1';
const TOKEN = process.env.LUMI_TOKEN || '';

const headers = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
});

export async function logsCommand(opts: any) {
  const limit = parseInt(opts.limit) || 10;
  const agentFilter = opts.agent ? `&agentId=${opts.agent}` : '';

  const spinner = ora('Buscando logs...').start();
  try {
    const res = await fetch(`${API_URL}/analytics/interactions?limit=${limit}${agentFilter}`, {
      headers: headers(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      spinner.fail(chalk.red(`Erro ${res.status}`));
      return;
    }

    const data = await res.json();
    const interactions = data.interactions || data || [];
    spinner.stop();

    if (!interactions.length) {
      console.log(chalk.yellow('\nNenhuma interação encontrada.'));
      return;
    }

    console.log(chalk.hex('#FF6B35')(`\n📋 Últimas ${interactions.length} interações:\n`));

    interactions.forEach((log: any) => {
      const date = new Date(log.createdAt || log.created_at).toLocaleString('pt-BR');
      const status = log.status === 'success' ? chalk.green('✓') : chalk.red('✗');
      const model = log.model || '—';
      const latency = log.latencyMs || log.latency_ms || 0;
      const tokens = log.tokensUsed || log.tokens_used || 0;
      const agentName = log.agent?.name || log.agentId?.slice(0, 8) || '—';

      console.log(`  ${status} ${chalk.gray(date)} | ${chalk.bold(agentName)} | ${model} | ${latency}ms | ${tokens} tokens`);
      if (log.userMessage || log.input) {
        const msg = (log.userMessage || JSON.stringify(log.input)).slice(0, 60);
        console.log(`    ${chalk.gray(`"${msg}..."`)}`);
      }
    });

    console.log('');
  } catch (err: any) {
    spinner.fail(chalk.red(`Erro: ${err.message}`));
  }
}

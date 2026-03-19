import chalk from 'chalk';
import ora from 'ora';

const API_URL = process.env.LUMI_API_URL || 'http://localhost:3001/v1';

async function checkEndpoint(url: string, label: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function statusCommand() {
  console.log(chalk.hex('#FF6B35')('\n📊 Status do Sistema\n'));

  // Backend
  const spinnerBackend = ora('Verificando backend...').start();
  const backendOk = await checkEndpoint(`${API_URL.replace('/v1', '')}/health`, 'Backend');
  if (backendOk) {
    spinnerBackend.succeed(chalk.green('Backend: Online'));
  } else {
    // Tenta a raiz
    const backendRoot = await checkEndpoint(API_URL.replace('/v1', ''), 'Backend');
    if (backendRoot) spinnerBackend.succeed(chalk.green('Backend: Online'));
    else spinnerBackend.fail(chalk.red('Backend: Offline'));
  }

  // Dashboard
  const spinnerDash = ora('Verificando dashboard...').start();
  const dashOk = await checkEndpoint('http://localhost:3000', 'Dashboard');
  if (dashOk) {
    spinnerDash.succeed(chalk.green('Dashboard: Online (http://localhost:3000)'));
  } else {
    spinnerDash.fail(chalk.red('Dashboard: Offline'));
  }

  // Banco de dados (via API)
  const spinnerDb = ora('Verificando banco de dados...').start();
  try {
    const token = process.env.LUMI_TOKEN || '';
    const res = await fetch(`${API_URL}/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      spinnerDb.succeed(chalk.green(`Banco: OK — ${data.totalInteractions || 0} interações, ${data.activeAgents || 0} agentes`));
    } else {
      spinnerDb.warn(chalk.yellow('Banco: Conectado (autenticação necessária para detalhes)'));
    }
  } catch {
    spinnerDb.fail(chalk.red('Banco: Sem conexão'));
  }

  // Redis
  const spinnerRedis = ora('Verificando Redis (BullMQ)...').start();
  try {
    const res = await fetch(`${API_URL}/analytics/system-status`, {
      headers: { 'Authorization': `Bearer ${process.env.LUMI_TOKEN || ''}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const redis = data.redis || data.systems?.find((s: any) => s.name === 'Redis');
      if (redis?.status === 'online' || redis?.ok) {
        spinnerRedis.succeed(chalk.green('Redis: Online (BullMQ ativo)'));
      } else {
        spinnerRedis.warn(chalk.yellow('Redis: Offline (processamento direto em memória)'));
      }
    } else {
      spinnerRedis.warn(chalk.yellow('Redis: Status desconhecido'));
    }
  } catch {
    spinnerRedis.warn(chalk.yellow('Redis: Não verificável'));
  }

  console.log('');
}

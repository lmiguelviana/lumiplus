import chalk from 'chalk';
import { spawn } from 'child_process';
import path from 'path';
import ora from 'ora';

export async function startCommand(opts: any) {
  const rootDir = path.resolve(process.cwd());
  const backendDir = path.join(rootDir, 'backend');
  const dashboardDir = path.join(rootDir, 'dashboard');

  console.log(chalk.hex('#FF6B35')('\n⚡ Iniciando Lumi Plus...\n'));

  if (!opts.dashboardOnly) {
    const spinner = ora('Iniciando backend...').start();
    const backend = spawn('npm', ['run', 'dev'], {
      cwd: backendDir,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: opts.port || '3001' },
    });

    backend.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line.includes('listening') || line.includes('Server')) {
        spinner.succeed(chalk.green(`Backend rodando na porta ${opts.port || 3001}`));
      }
    });

    backend.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line && !line.includes('ExperimentalWarning')) {
        console.log(chalk.gray(`  [backend] ${line.slice(0, 100)}`));
      }
    });

    backend.on('error', () => spinner.fail(chalk.red('Erro ao iniciar backend')));
  }

  if (!opts.backendOnly) {
    const spinner = ora('Iniciando dashboard...').start();
    const dashboard = spawn('npm', ['run', 'dev'], {
      cwd: dashboardDir,
      stdio: 'pipe',
      shell: true,
    });

    dashboard.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line.includes('localhost') || line.includes('ready')) {
        spinner.succeed(chalk.green('Dashboard rodando em http://localhost:3000'));
      }
    });

    dashboard.on('error', () => spinner.fail(chalk.red('Erro ao iniciar dashboard')));
  }

  console.log(chalk.gray('\n  Pressione Ctrl+C para parar.\n'));

  // Manter processo vivo
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Parando Lumi Plus...'));
    process.exit(0);
  });
}

import chalk from 'chalk';
import ora from 'ora';

const API_URL = process.env.LUMI_API_URL || 'http://localhost:3001/v1';
const TOKEN = process.env.LUMI_TOKEN || '';

const headers = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
});

export async function skillsCommand(action: string, opts?: any) {
  if (action === 'list') {
    const spinner = ora('Buscando catálogo de skills...').start();
    try {
      const res = await fetch(`${API_URL}/skills/catalog`, {
        headers: headers(),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        spinner.fail(chalk.red(`Erro ${res.status}`));
        return;
      }

      const data = await res.json();
      const catalog = data.catalog || [];
      spinner.stop();

      console.log(chalk.hex('#FF6B35')(`\n⚡ ${catalog.length} skill(s) disponíveis:\n`));

      const natives = catalog.filter((s: any) => s.category === 'native');
      const integrations = catalog.filter((s: any) => s.category === 'integration');

      if (natives.length) {
        console.log(chalk.bold('  NATIVAS:'));
        natives.forEach((s: any) => {
          const active = s.activeAgents?.length > 0;
          const badge = active ? chalk.green(`${s.activeAgents.length} agente(s)`) : chalk.gray('inativa');
          console.log(`    ${active ? '✅' : '○ '} ${chalk.bold(s.name)} ${chalk.gray(`[${s.id}]`)} — ${badge}`);
          console.log(`       ${chalk.gray(s.description)}`);
        });
      }

      if (integrations.length) {
        console.log(chalk.bold('\n  INTEGRAÇÕES:'));
        integrations.forEach((s: any) => {
          const active = s.activeAgents?.length > 0;
          const badge = active ? chalk.green(`${s.activeAgents.length} agente(s)`) : chalk.gray('inativa');
          const creds = s.credentials?.length ? chalk.yellow(`Requer: ${s.credentials.map((c: any) => c.label).join(', ')}`) : '';
          console.log(`    ${active ? '✅' : '○ '} ${chalk.bold(s.name)} ${chalk.gray(`[${s.id}]`)} — ${badge}`);
          console.log(`       ${chalk.gray(s.description)}`);
          if (creds) console.log(`       ${creds}`);
        });
      }

      console.log('');
    } catch (err: any) {
      spinner.fail(chalk.red(`Erro: ${err.message}`));
    }
  }

  if (action === 'activate') {
    const spinner = ora(`Ativando skill "${opts.skillId}" para agente ${opts.agentId}...`).start();
    try {
      const res = await fetch(`${API_URL}/skills/agent/${opts.agentId}/activate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ skillId: opts.skillId }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        spinner.fail(chalk.red(`Erro ${res.status}: ${await res.text()}`));
        return;
      }

      spinner.succeed(chalk.green(`Skill "${opts.skillId}" ativada!`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Erro: ${err.message}`));
    }
  }
}

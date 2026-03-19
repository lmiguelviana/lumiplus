# Fase 14: Evolução do Núcleo (CommandHandler, WebSearch & Skills) 🚀

Esta fase marca a transição do Lumi Plus de um chatbot reativo para um sistema de agentes autônomos e proativos, capazes de interagir com o mundo real e gerenciar sua própria execução.

## 🛠️ Funcionalidades Implementadas

### 1. Interceptador de Comandos (`CommandHandler`)
Implementamos uma camada de inteligência antes do processamento de IA para lidar com comandos administrativos e de navegação diretamente nos canais (WhatsApp/Telegram).
- **/agentes:** Lista todos os agentes ativos no workspace do tenant.
- **/usar <n>:** Alterna o agente ativo da conversa em tempo real, salvando o estado nos metadados da conversação.
- **/ajuda:** Central de ajuda dinâmica.
- **/status:** Exibe o agente e canal atuais.

### 2. Sistema de Skills (Tool Calling)
Evoluímos o `AIService` para suportar o padrão de *Function Calling* da OpenAI. Isso permite que a IA decida quando e como usar ferramentas externas.
- **Web Search**: Capacidade de buscar notícias e fatos em tempo real via Brave Search API.
- **Knowledge Search**: A IA agora decide quando consultar o Knowledge Hub (RAG) em vez de injetar tudo no prompt, economizando tokens e melhorando a precisão.
- **Escalation**: Uma ferramenta para que o agente peça ajuda humana formalmente quando encontra um problema fora de seu escopo.

### 3. Agendamento Autônomo (Cron Jobs)
Agentes agora não dependem apenas de mensagens para agir. Criamos o `CronService` que permite:
- Execução de tarefas recorrentes (ex: "Enviar relatório de vendas toda segunda-feira").
- Proatividade baseada em tempo, integrada diretamente com o cérebro do agente.
- Gerenciamento dinâmico via banco de dados sem necessidade de restart do servidor.

### 4. Escalação Humana (Human-in-the-Loop)
Implementamos um fluxo formal para que o agente "levante a mão".
- Registro de incidentes no banco de dados com contexto da conversa.
- Status de pendência para que atendentes reais possam assumir no painel administrativo futuramente.

## 🏗️ Evolução da Arquitetura

- **Prisma Schema**: Adição dos modelos `AgentKnowledge`, `AgentCronJob` e `Escalation`.
- **Gateway Integration**: `WhatsAppService` e `TelegramService` agora possuem um middleware de comandos.
- **pgvector**: Estabilização total da busca semântica em servidores self-hosted.

## 🔌 SDK de Skills Externas (Adição — Fase 22)

> Ver spec completa em [22_Compatibilidade_Frameworks_OpenSource.md](./22_Compatibilidade_Frameworks_OpenSource.md)

A evolução do sistema de skills permite que **desenvolvedores externos** criem skills em qualquer linguagem e as registrem no Lumi Plus via webhook + contrato OpenAPI.

### Contrato de uma Skill Externa

```typescript
interface LumiSkill {
  name: string;           // identificador único, snake_case
  description: string;   // descrição para a IA decidir quando usar
  inputSchema: JSONSchema; // parâmetros de entrada (JSON Schema)
  auth: { type: 'hmac_sha256' | 'bearer' | 'api_key' | 'none' };
  endpoint: string;        // URL do webhook POST
  timeoutSeconds?: number;
}
```

### Registro via CLI

```bash
lumi skill add --name consulta_cnpj --webhook https://minha-skill.com/execute --secret xxx
lumi skill list
lumi skill test consulta_cnpj --input '{"cnpj": "11.222.333/0001-44"}'
lumi skill remove consulta_cnpj
```

### Skills Externas no Tool Calling

Uma vez registrada, a skill aparece automaticamente no catálogo de ferramentas do agente. O AIService chama o webhook com assinatura HMAC-SHA256 e injeta o resultado no contexto:

```json
{ "tool": "consulta_cnpj", "cnpj": "11.222.333/0001-44" }
→ POST https://minha-skill.com/execute
→ { "success": true, "data": { "razao_social": "Empresa Ltda", "situacao": "Ativa" } }
```

---
🤖 **Applying knowledge of @backend-specialist...**
A Fase 14 transformou o Lumi Plus em uma plataforma de orquestração real. Os agentes agora têm mãos (tools), agenda (cron) e senso de hierarquia (escalation). O SDK de skills externas (Fase 22) expande isso para qualquer desenvolvedor da comunidade.

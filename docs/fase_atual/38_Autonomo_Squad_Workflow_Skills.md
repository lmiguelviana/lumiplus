# Fase 38 concluída — Autonomia conversacional (Squads/Workflows via chat) e Proatividade Operacional (`lumi_proactive` com Heartbeat e Reverse Prompting).
Status: Concluído | Data: 24/03/2026

---

## 🎯 Objetivo
Permitir que os agentes do Lumi Plus decidam autonomamente quando acionar suas equipes (Squads) ou disparar automações (Workflows) durante uma conversa natural, sem depender apenas de comandos manuais (`/`).

---

## 🛠️ Implementação Técnica

### 1. Novas Agent Skills (`backend/src/services/skills`)
Foram adicionadas duas novas skills ao catálogo nativo do sistema:

- **`run_squad`**:
  - **Função**: O agente atua como líder e delega uma tarefa complexa para sua squad.
  - **Fluxo**: Invoca o `SwarmService` que orquestra os membros especialistas e devolve o resultado consolidado.
  - **Uso**: Ideal para tarefas que exigem múltiplos passos ou especialidades (ex: "Pesquise e escreva um relatório").

- **`lumi_proactive`**: 
  - **Reverse Prompting**: Força o agente a sugerir "Próximos Passos".
  - **Heartbeat System**: Cria um CronJob diário (`activate_heartbeat`) para auto-melhoria e revisão de desempenho.
- **`Stabilization Hotfix`**: 
  - Corrigido erro "Invalid key length" no `VaultService` (ordem dos argumentos `key` e `iv` estava invertida).
  - Melhorado retry de 402 (credits) no `AIService` com margem de segurança maior.

### 2. Catálogo e Registro (`catalog.ts` & `registry.ts`)
- **Definição**: Incluídas no `SKILL_CATALOG` com esquema JSON Schema para as ferramentas (tools).
- **Handlers**: Implementada a lógica de execução no `SKILL_HANDLERS`, garantindo integração com os serviços de orquestração existentes.
- **Marketplace**: As skills aparecem no dashboard para ativação por agente (não são ativadas por padrão para economizar tokens).

---

## 🚀 Como Usar

1. **Ativação**: No dashboard, vá em **Skills** e ative **"Acionar Squad"** para o seu agente.
2. **Configuração**: Certifique-se de que o agente tem membros na squad (comando `/squad add`).
3. **Conversa Natural**: No Telegram, WhatsApp ou Web Chat, peça algo como:
   > *"Com sua equipe, crie um plano de marketing para o produto X."*
4. **Resultado**: O agente chamará a ferramenta, a squad trabalhará em background e ele entregará a resposta final completa.

---

## 📈 Benefícios
- **Autonomia**: A IA agora "sabe" que pode pedir ajuda para outros agentes.
- **Redução de Comandos**: Menos necessidade de decorar comandos `/squad exec` ou `/run`.
- **Escalabilidade**: Agentes podem encadear processos complexos apenas conversando.

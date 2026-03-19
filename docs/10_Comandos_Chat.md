# Guia de Comandos de Chat — Lumi Plus 💬

O **Lumi Plus** oferece uma interface de comandos de texto (slash commands) que funciona de forma consistente em todos os canais integrados: **Web Chat**, **WhatsApp** e **Telegram**.

---

## 🤖 Comandos para Agentes

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/agentes` | Lista todos os agentes ativos no workspace atual. | `/agentes` |
| `/usar <n>` | Alterna o agente ativo na conversa atual pelo índice da lista. | `/usar 1` |
| `/status` | Exibe o nome do agente ativo, o canal e o ID do workspace. | `/status` |
| `/resetar` | Reinicia a memória de curto prazo da conversa (contexto). | `/resetar` |

---

## 🫂 Comandos para Squads

Os comandos de squad permitem orquestrar múltiplos agentes de uma vez.

| Comando | Descrição | Canal |
|---------|-----------|-------|
| `/squad lista` | Lista todas as squads disponíveis no workspace. | Todos |
| `/squad usar <nome>` | Ativa uma squad no chat atual (o bot passa a agir como a squad). | Web Chat |
| `/squad info` | Mostra detalhes da missão da squad e seus membros. | Web Chat |
| `/squad exec <missão>` | Dispara a execução da squad com um objetivo específico. | Web Chat |
| `/squad status` | Mostra o progresso atual da execução da squad. | Web Chat |
| `/squad memoria` | Recupera o que a squad aprendeu (memória semântica do líder). | Web Chat |
| `/squad reset` | Desativa a squad e volta para o agente individual anterior. | Web Chat |

---

## 🚀 Comandos de Automação (Workflows)

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/run <nome>` | Dispara o início de um **Workflow** específico pelo nome. | `/run Relatório Semanal` |

> **Nota:** Workflow disparados via `/run` em canais externos (WA/TG) rodam de forma autônoma e os resultados são entregues conforme configurado no canvas do workflow.

---

## ⚡ Outros Comandos

| Comando | Descrição |
|---------|-----------|
| `/skills` | Lista todas as ferramentas (skills) ativas para o agente selecionado. |
| `/ajuda` | Mostra a lista completa de comandos disponíveis. |
| `/limpar` | Limpa o histórico visual do chat (apenas no Web Chat). |

---

## 🔐 Comandos Administrativos (Apenas Dono)

Estes comandos requerem que o remetente seja o proprietário do workspace.

| Comando | Descrição |
|---------|-----------|
| `/config` | Acesso rápido às configurações do bot via chat. |
| `/memoria` | Visualiza todos os fatos conhecidos sobre o contato atual. |
| `/logs` | Exibe logs rápidos de performance (latência e tokens) das últimas interações. |
| `/pausar` | Interrompe o processamento de mensagens deste tenant temporariamente. |
| `/retomar` | Reativa o processamento de mensagens. |

---
*Atualizado em 20/03/2026*

# CLAUDE.md

## Antigravity Kit (.agent/)

Este projeto usa o Antigravity Kit. Sempre que receber uma tarefa, consulte automaticamente os recursos em `.agent/` seguindo este protocolo:

### Protocolo de Roteamento Automático

1. **Identifique o domínio da tarefa** (frontend, backend, database, segurança, testes, etc.)
2. **Carregue o agente especialista** correspondente em `.agent/agents/` para adotar o papel adequado
3. **Carregue as skills relevantes** em `.agent/skills/` (leia o SKILL.md de cada skill necessária)
4. **Siga os workflows** em `.agent/workflows/` quando aplicável

### Mapeamento Rápido

| Tarefa | Agente | Skills |
|--------|--------|--------|
| UI/Frontend | frontend-specialist | frontend-design, nextjs-react-expert, tailwind-patterns, web-design-guidelines |
| API/Backend | backend-specialist | api-patterns, nodejs-best-practices |
| Banco de dados | database-architect | database-design |
| Mobile | mobile-developer | mobile-design |
| Segurança | security-auditor | vulnerability-scanner, red-team-tactics |
| Testes | test-engineer | testing-patterns, tdd-workflow, webapp-testing |
| Debug | debugger | systematic-debugging |
| Performance | performance-optimizer | performance-profiling |
| SEO | seo-specialist | seo-fundamentals, geo-fundamentals |
| Planejamento | project-planner | brainstorming, plan-writing, architecture |
| Games | game-developer | game-development |
| DevOps/Deploy | devops-engineer | deployment-procedures, server-management |
| Code review | code-archaeologist | clean-code, code-review-checklist |
| Documentacao | documentation-writer | documentation-templates |
| Multi-tarefa | orchestrator | parallel-agents, behavioral-modes |

### Regra Principal

**SEMPRE** consulte os arquivos relevantes em `.agent/` antes de responder. Isso garante respostas mais completas, estruturadas e alinhadas com as melhores práticas definidas nas skills.

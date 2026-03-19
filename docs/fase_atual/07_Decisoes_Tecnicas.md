# Histórico de Decisões Técnicas (ADR) 🧠

Este documento registra as decisões críticas tomadas durante o desenvolvimento e o "porquê" de cada escolha.

## 1. Downgrade do Prisma (v7 para v6)
- **Decisão:** Forçamos o uso do Prisma `6.2.1`.
- **Motivo:** A versão 7 apresentou incompatibilidades com o sistema de RLS (Row Level Security) dinâmico via `SET LOCAL`. A v6 permite controle total via Raw SQL sem a sobrecarga de tipos experimentais.

## 2. Abstração Database-Agnostic
- **Decisão:** Mudança de IDs `UUID` nativos para `String` no Prisma.
- **Motivo:** Permitir que o sistema rode tanto em SQLite (local/dev) quanto PostgreSQL/Supabase (produção) sem alteração no código fonte.

## 3. Orquestração via OpenRouter
- **Decisão:** Centralizar chamadas de IA via OpenRouter.
- **Motivo:** Evitar vendor-locking (ficar preso apenas à OpenAI). O sistema de fallbacks garante que se o GPT-4o cair, o Claude ou Gemini assumem instantaneamente.

## 5. Migração para ESM (Type: Module)
- **Decisão:** Mudamos o backend de CommonJS para ECMAScript Modules (`type: module`).
- **Motivo:** Manter paridade com o ecossistema do Dashboard (Next.js) e suportar os padrões de importação modernos exigidos por bibliotecas de IA e mensageria de 2025.

## 6. Substituição de TS-Node por TSX
- **Decisão:** O runner de desenvolvimento foi alterado para `tsx watch`.
- **Motivo:** O `tsx` oferece suporte nativo superior a ESM e TypeScript sem a necessidade de configurações complexas de loaders, resultando em um ciclo de desenvolvimento (HMR) mais rápido e estável.

## 8. Sistema de Design Industrial (Ivory & Onyx)
- **Decisão:** Adoção de uma linguagem visual baseada em geometria afiada e alto contraste real.
- **Motivo:** Fugir dos clichês de IA (glassmorphism/azul/roto) e estabelecer uma estética de "ferramenta de engenharia" que transmita precisão e performance, suportando nativamente temas Claro e Escuro sem poluição visual.

## 9. Orquestração Híbrida & Modo Economia
- **Decisão:** Implementar uma cadeia de 5 níveis de fallback com injeção dinâmica de modelos econômicos.
- **Motivo:** Cumprir o PRD v2 que exige resiliência máxima e controle de custos. A lógica de "Economy Mode" permite que o sistema escale sem drenar créditos de forma desnecessária, priorizando modelos Mini/Flash.

## 10. Segurança BYOK & Vault (AES-256-GCM)
- **Decisão:** Implementação do `VaultService` para criptografar chaves de API antes da persistência no banco de dados.
- **Motivo:** Garantir isolamento e segurança de nível bancário em cenários multi-tenant. O uso de **AES-256-GCM** com `VAULT_MASTER_KEY` garante que mesmo com acesso ao banco de dados, as chaves de terceiros (OpenRouter, Groq, Meta) permaneçam ilegíveis sem a chave mestre do ambiente. As chaves do Agente agora sobrescrevem dinamicamente as do Workspace via `SettingsService`.

## 11. Tratamento de Vetores no Prisma (Exclusão em Raw Queries)
- **Decisão:** Excluir explicitamente colunas do tipo `vector(1536)` de seleções Raw SQL (SELECT) que precisem ser processadas pelo Prisma Client.
- **Motivo:** O Prisma 6.2.1 falha ao tentar desserializar o tipo `vector` nativo do Postgres em objetos JavaScript via `$queryRaw`. Para manter a performance e estabilidade, as listagens de metadados de conhecimento agora selecionam apenas campos escalares, realizando a busca vetorial em uma query segregada.

## 12. Compatibilização de Tipos Raw SQL (Text vs UUID)
- **Decisão:** Uso de coerção explícita `::text` em parâmetros de queries Raw SQL para colunas de identificação (`id`, `agent_id`, `tenant_id`).
- **Motivo:** O Prisma declara UUIDs como `String` no esquema, gerando colunas `TEXT` no Postgres. O driver NodeJS, ao detectar strings com formato de UUID, tenta enviá-las como o tipo `uuid` nativo, gerando o erro `operator does not exist: text = uuid`. A coerção forçada para `::text` nas queries garante compatibilidade total e evita quebras silenciosas em operações de delete/update.

## 13. Política de CORS Granular para Manutenção
- **Decisão:** Expansão explícita dos métodos permitidos no middleware de CORS para incluir `PUT` e `DELETE`.
- **Motivo:** Operações administrativas de "CRUD de Conhecimento" exigem métodos além do padrão GET/POST. A configuração restritiva anterior causava falhas de "Network Error" em navegadores modernos durante o Preflight (OPTIONS Request).

---
🤖 **Applying knowledge of @backend-specialist...**
Cada decisão técnica foi tomada visando o equilíbrio entre performance imediata e escalabilidade futura, garantindo que o núcleo do sistema seja agnóstico a drivers e resiliente a inconsistências de tipos.

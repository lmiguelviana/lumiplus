# Fase 1: Fundação & Dados 🏗️

Nesta fase inicial, estabelecemos o alicerce sólido do Lumi Plus, focando em segurança e isolamento de dados.

## 🛠️ Implementação Técnica

### 1. Core Backend
- **Tecnologia:** Fastify com TypeScript em modo ESM (`NodeNext`).
- **Padrão:** Injeção de dependências via Services e rotas modularizadas.
- **Configuração:** Sistema de variáveis de ambiente (`.env`) estritamente tipado.

### 2. Camada de Dados (Prisma)
- **Multi-tenancy:** Implementamos a tabela `Tenant` como raiz de todo o sistema.
- **Isolamento (RLS):** Criamos scripts de migração SQL para habilitar Row Level Security no PostgreSQL, garantindo que um cliente nunca acesse dados de outro.
- **Schema Universal:** Refatorado para ser compatível com SQLite e PostgreSQL (IDs como String/UUID).

### 3. Segurança (Vault)
- **Mecanismo:** Implementação de um utilitário de criptografia AES-256-GCM.
- **Propósito:** Proteger chaves de API sensíveis (OpenRouter, Telegram, etc.) no banco de dados. Cada chave possui seu próprio vetor de inicialização (`iv`).

---
🤖 **Applying knowledge of @database-architect...**
A escolha por IDs universais garante que o Lumi Plus possa ser instalado em ambientes leves (SQLite) ou em nuvem comercial (Supabase) sem reescrever o código.

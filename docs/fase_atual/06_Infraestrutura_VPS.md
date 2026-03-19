# Infraestrutura & VPS 🌐

O Lumi Plus agora reside em um ambiente de produção real na VPS (Easypanel).

## 🌍 Setup de Produção

### 1. Conectividade
- **Host:** IP fixo `217.76.48.224`.
- **Porta:** 5432 (PostgreSQL) exposta via socat e protegida por senha.
- **Banco de Dados:** PostgreSQL 17 (Supabase Managed via VPS).

### 2. Configuração de Ambiente (`.env`)
Implementamos as chaves definitivas:
- `JWT_SECRET` e `SECRET_KEY_BASE` para criptografia de sessões.
- `ANON_KEY` e `SERVICE_ROLE_KEY` compatíveis com o Supabase.

### 3. Migração de Produção
O banco remoto foi sincronizado com sucesso usando o Prisma Migrate, criando todas as tabelas e índices necessários para o funcionamento pleno do sistema.

---
🤖 **Applying knowledge of @database-architect...**
A estrutura está pronta para receber milhares de requisições. O uso de uma VPS com Easypanel oferece o controle de um servidor dedicado com a facilidade da nuvem.

# Fase 15: Workspace Settings & BYOK (Bring Your Own Key) 🔐

Esta fase marca a transição do Lumi Plus para uma arquitetura multi-tenant definitiva e segura, delegando o controle de chaves de API do arquivo `.env` para o banco de dados via interface do usuário, com criptografia forte.

## 🚀 Funcionalidades Implementadas

### 1. Sistema de Cofre (VaultService)
- **Engine:** Criptografia AES-256-GCM.
- **Isolamento:** Uso de vetores de incialização únicos (IVs) e salt dinâmico por chave salva.
- **Robustez:** Protegida por uma chave mestra raiz (`VAULT_MASTER_KEY`).

### 2. Configurações por Tenant (SettingsService)
- **Fallback Inteligente:** Se não encontrar uma chave no BD para o Tenant, faz fallback seguro para a chave global legada no `.env` para manter compatibilidade retroativa com ambientes de desenvolvimento.
- **UI Integrada:** Rota `/settings` criada no Dashboard Web, mascarando visualmente as chaves secretas (••••••••).

### 3. Integrações Refatoradas (Core Services)
Os seguintes motores de Inteligência Artificial agora suportam "Bring Your Own Key" a nível de Tenant e Agente:
- **AIService:** OpenRouter API (GPT-4o, Claude, Llama).
- **VisionService:** Modelos fotográficos/multimodais (OpenRouter).
- **TranscriptionService:** Modelos Whisper ultra-rápidos (Groq).
- **EmbeddingService:** Geração vetorial para Knowledge Hub RAG.

## 🛠️ Detalhes Técnicos
- Novo Schema Prisma: Adicionado o modelo `WorkspaceSetting` como entidade relacional do `Tenant`.
- Rotas API (`/v1/settings`): Endpoints protegidos (GET e PUT) para buscar as configurações atuais e salvar novas de forma criptografada.
- Script de Migração: Criado o utilitário `scripts/migrate_settings.ts` para portabilidade rápida do ambiente local `.env`.

---
🤖 **Applying knowledge of @security-auditor...**
Foi garantido que NENHUMA chave de provedor (OpenRouter, Groq, Meta) transite em plain-text no banco de dados. O algoritmo AES-256 foi implementado corretamente na classe `VaultService`. A listagem no frontend envia apenas placeholders ocultos pro cliente (`••••••••`), minimizando vetores de ataque em caso de XSS.

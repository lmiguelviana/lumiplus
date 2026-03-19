# Fase 4: Inteligência & RAG 🧠

Esta fase transformou o bot em um sistema com memória de longo prazo.

## 🔎 Recuperação Aumentada (RAG)

### 1. Serviço de Embeddings
- Transformamos texto plano em vetores matemáticos usando o modelo `text-embedding-3-small`.
- Esses vetores permitem que a IA faça buscas por **significado** e não apenas por palavras-chave.

### 2. Busca Vetorial (pgvector)
- **SQL Raw:** Utilizamos queries nativas do PostgreSQL para calcular a similaridade de cosseno (`<=>`).
- **Arquitetura Híbrida:** O sistema detecta se o banco é Postgres (ativa RAG) ou SQLite (desativa RAG ou usa fallback), mantendo a portabilidade.

---
🤖 **Applying knowledge of @backend-specialist...**
O RAG permite que o Lumi Plus responda baseado em documentos próprios do usuário, eliminando alucinações.

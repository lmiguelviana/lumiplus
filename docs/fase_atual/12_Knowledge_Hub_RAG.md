# Fase 12: Knowledge Hub (RAG & Memória Semântica) 🧠

Esta fase implementou a capacidade dos agentes de "aprender" com documentos externos, utilizando busca vetorial (pgvector) e processamento de linguagem natural.

## 🏗️ Arquitetura do Knowledge Hub

### 1. Processamento de Dados (Chunking)
Para que a IA consiga processar documentos grandes sem estourar o limite de contexto, implementamos um motor de fatiamento no `KnowledgeService`:
- **CHUNK_SIZE:** 1000 caracteres.
- **CHUNK_OVERLAP:** 100 caracteres (mantém a continuidade do contexto entre fragmentos).

### 2. Busca Vetorial (pgvector)
- Cada fragmento de texto é transformado em um vetor de 1536 dimensões via OpenRouter/OpenAI.
- As buscas são realizadas usando a similaridade de cosseno (`<=>`) diretamente no PostgreSQL.
- **Isolamento:** A busca é filtrada rigorosamente por `tenant_id` e `agent_id`.

## 🖥️ Interface de Gerenciamento

Criamos uma central dedicada no Dashboard (`/knowledge`):
- **Brain Icon Sidebar:** Acesso rápido à central.
- **Agent Selection:** Lista lateral para alternar entre os cérebros dos agentes.
- **Injeção Primal:** Terminal para colagem de texto e processamento imediato.
- **Memory Inspector:** Lista técnica de todos os fragmentos armazenados com metadados de chunk.
- **CRUD Completo:** Implementamos as operações de **Edição (Update)** e **Exclusão (Delete)** de fragmentos individuais, permitindo refinamento curado do conhecimento da IA pelo usuário.

## 🚦 Impacto na IA (RAG)
O `AIService` agora segue o fluxo:
1. Captura a mensagem do usuário.
2. Consulta a base de conhecimento vetorial.
3. Injeta os fragmentos mais relevantes no Prompt de Sistema.
4. Responde com base em fatos, reduzindo alucinações.

## 🛠️ Estabilização & Refinamento Técnico (Março 2026)

Recentemente, o Knowledge Hub passou por uma fase de endurecimento para garantir 100% de confiabilidade:
1. **Prisma & pgvector:** Corrigimos uma falha de desserialização onde o Prisma tentava ler colunas do tipo `vector` em queries brutas. Agora, as listagens excluem explicitamente esses campos para performance e estabilidade.
2. **Ambiente Resiliente:** Corrigimos o carregamento de variáveis de ambiente (`OPENROUTER_API_KEY`) e tornamos o sistema tolerante a erros de digitação no `.env`.
3. **Consistência de Tipos:** Resolvemos o conflito `text = uuid` em queries SQL brutas através de type-casting preventivo (`::text`), garantindo que o PostgreSQL aceite identificadores de string vindos do Prisma sem erros de casting.
4. **Acesso Seguro:** Atualizamos as políticas de CORS no servidor Fastify para suportar métodos administrativos (`PUT`, `DELETE`), eliminando erros de rede em requisições de manutenção.

---
🤖 **Applying knowledge of @backend-specialist...**
O Knowledge Hub agora oferece controle total sobre a memória dos agentes, permitindo uma curadoria precisa e protegida por um pipeline de dados robusto e imune a falhas de rede ou tipo.

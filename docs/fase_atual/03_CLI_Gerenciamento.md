# Fase 3: CLI & Gerenciamento 🛠️

Para facilitar o dia a dia, criamos uma interface de linha de comando poderosa.

## 🐚 Lumi CLI (`@lumiplus/cli`)

### 1. Comandos Core
- **`lumi init`:** Um wizard interativo que guia o usuário na criação de um novo workspace, configurando o banco de dados e as variáveis de ambiente automaticamente.
- **Workflow:** Detecta se o deploy é Cloud, Supabase ou Self-hosted.

### 2. Instalação via GitHub
- Otimizamos o `package.json` para permitir que o Lumi Plus seja instalado diretamente de um repositório git.
- **Comando sugerido:** `npm link` para desenvolvedores trabalharem localmente com a ferramenta.

---
🤖 **Applying knowledge of @project-planner...**
A CLI reduz o tempo de setup de 2 horas para menos de 5 minutos, permitindo o scale-up do projeto.

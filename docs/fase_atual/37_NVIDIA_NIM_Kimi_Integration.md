# Fase 37: Integração NVIDIA NIM & Kimi K2.5
Status: Concluído | Data: 24/03/2026

---

## 🎯 Objetivo
Adicionar suporte nativo aos modelos hospedados na infraestrutura **NVIDIA NIM**, com foco especial no modelo multimodal e agentic **Kimi K2.5 (Moonshot AI)**. O objetivo é permitir que o Lumi Plus utilize o poder computacional da NVIDIA para modelos de raciocínio avançado (Thinking Mode).

---

## 🛠️ Implementação Técnica

### 1. Adapter NVIDIA NIM (`backend/src/services/providers`)
- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
- Autenticação: Bearer Token (`nvidia_nim_key`)
- **Suporte a Thinking Mode (Kimi K2.5):**
  - Implementação de lógica para detectar modelos de raciocínio.
  - Ajuste automático de parâmetros: `temperature: 1.0` e `top_p: 0.95` (recomendado pela NVIDIA).
  - Desativação automática de streaming para garantir a captura do `reasoning_content`.
  - Parseamento do campo `reasoning_content` injetando a tag `<think>` na resposta final.

### 2. Multi-Provider & Fallback (`backend/src/services/ai.service.ts`)
- Implementação de um **decoder de modelo** que interpreta o prefixo `nvidia:`.
- Permite que a UI selecione modelos NIM diretamente: `nvidia:moonshotai/kimi-k2.5`.
- Integração perfeita com o sistema de fallback existente.

### 3. Dashboard Settings (`dashboard/src/app/settings/page.tsx`)
- Adição da **NVIDIA NIM** como provedor principal e de fallback.
- Cadastro de modelos NIM populares no seletor de modelo padrão.
- Campo dedicado para a **NVIDIA NIM API Key** (armazenada com criptografia AES no banco).

### 4. Gestão de Agentes (`dashboard/src/app/agents/page.tsx`)
- Inclusão do grupo `⚡ NVIDIA NIM` nos modais de criação e edição de agentes.
- Modelos pré-configurados: Kimi K2.5, Llama 3.1 405B/70B/8B e Nemotron 70B.

---

## 🧠 Modelos Suportados

| Modelo | ID NIM | Características |
|--------|--------|-----------------|
| **Kimi K2.5** | `moonshotai/kimi-k2.5` | Multimodal, Agentic, Thinking Mode ativo |
| **Llama 3.1 405B** | `meta/llama-3.1-405b-instruct` | O maior modelo open-source do mundo |
| **Nemotron 70B** | `nvidia/llama-3.1-nemotron-70b-instruct` | Otimizado pela NVIDIA para melhor performance |
| **Mistral Large 2** | `mistralai/mistral-large-2-instruct` | Excelente equilíbrio entre custo e inteligência |

---

## 🚀 Como Configurar

1. Obtenha sua chave de API em [build.nvidia.com](https://build.nvidia.com).
2. Vá em **Configurações** → **Provedor de IA**.
3. Selecione **NVIDIA NIM**.
4. Insira sua chave `nvapi-...`.
5. Selecione **Kimi K2.5** como seu cérebro principal.
6. Salve e teste no chat!

---

## 📈 Impacto
- **Qualidade:** Acesso a modelos com "Chain of Thought" nativo (Kimi K2.5).
- **Escalabilidade:** Infraestrutura de baixa latência da NVIDIA.
- **Redundância:** Mais um provedor robusto disponível para fallback caso o OpenRouter ou outros instuem.

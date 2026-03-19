'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, ChevronDown, ChevronRight, Search,
  Zap, Bot, Workflow, Brain, Share2, Sparkles,
  Clock, MessageSquare, Key, Settings, Terminal,
  PlayCircle, CheckCircle2, AlertCircle, ArrowRight,
  Code, Globe, Download
} from 'lucide-react';

// ── Dados da Central de Ajuda ──────────────────────────────

const CATEGORIES = [
  {
    id: 'primeiros-passos',
    icon: Zap,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'Primeiros Passos',
    desc: 'Configure o sistema do zero',
    articles: [
      {
        title: 'Configurando sua primeira API de IA',
        content: `
## Como configurar o OpenRouter (recomendado)

O OpenRouter é o gateway principal de IA — ele dá acesso a +300 modelos (GPT, Claude, Gemini, etc) com uma única chave.

**Passo a passo:**
1. Acesse [openrouter.ai](https://openrouter.ai) e crie uma conta
2. Vá em **Keys** → **Create Key**
3. Copie a chave (começa com \`sk-or-v1-...\`)
4. No Lumi Plus → **Configurações** → **OpenRouter API Key** → cole e salve

**Modelos gratuitos disponíveis:**
- \`google/gemini-2.0-flash-001\` — rápido e capaz, gratuito
- \`meta-llama/llama-3.1-8b-instruct:free\` — open-source gratuito
- \`deepseek/deepseek-chat:free\` — ótimo para código

> **Dica:** Comece com modelos gratuitos para testar. Adicione créditos quando quiser usar GPT-4 ou Claude.
        `
      },
      {
        title: 'Criando seu primeiro agente',
        content: `
## Criando um Agente

Agentes são o coração do Lumi Plus — cada um tem personalidade, habilidades e canais próprios.

**Passo a passo:**
1. Vá em **Agentes** → clique **+ Novo Agente**
2. Preencha:
   - **Nome:** ex: "Assistente de Vendas"
   - **Missão:** o que ele faz resumidamente
   - **Soul (personalidade):** como ele fala, o que sabe, como se comporta
3. Escolha o modelo de IA (recomendado: \`google/gemini-2.0-flash-001\` para começar)
4. Salve e teste no **Chat Web**

**Exemplo de Soul:**
\`\`\`
Você é o Carlos, assistente de vendas da empresa X.
Seu tom é profissional mas amigável.
Você conhece nosso catálogo de produtos e ajuda clientes a escolher a melhor opção.
Sempre pergunte o nome do cliente no início da conversa.
\`\`\`
        `
      },
      {
        title: 'Conectando ao Telegram',
        content: `
## Conectar Agente ao Telegram

Cada agente pode ter seu próprio bot no Telegram.

**Passo a passo:**
1. Abra o Telegram e procure por **@BotFather**
2. Envie \`/newbot\` e siga as instruções
3. Copie o token que o BotFather gerar (ex: \`7123456789:ABC...\`)
4. No Lumi Plus → **Agentes** → clique no agente → aba **Canais**
5. Em **Telegram** → cole o token → **Ativar**
6. Pronto! Procure o bot no Telegram e comece a conversar.

**Configurações avançadas:**
- **Modo:** responder sempre / só quando mencionado / só em grupos
- **Cooldown:** evita spam em grupos (padrão: 30s)
- **Allowlist:** restringe quem pode usar o bot
        `
      },
      {
        title: 'Conectando ao WhatsApp',
        content: `
## Conectar Agente ao WhatsApp (via QR Code)

O Lumi Plus usa Baileys para conectar ao WhatsApp sem precisar de API oficial.

**Passo a passo:**
1. Vá em **Agentes** → clique no agente → aba **Canais**
2. Em **WhatsApp** → clique **Conectar**
3. Um QR Code aparecerá na tela
4. No celular: **WhatsApp** → menu ⋮ → **Aparelhos Conectados** → **Conectar Aparelho**
5. Escaneie o QR Code
6. Aguarde a conexão (ícone verde = conectado)

> **Importante:** Use um número de WhatsApp dedicado para o bot. Usar o número principal pode gerar bloqueio.
        `
      },
    ]
  },
  {
    id: 'agentes',
    icon: Bot,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Agentes & Soul',
    desc: 'Personalize comportamento e identidade',
    articles: [
      {
        title: 'O que é o Soul de um agente?',
        content: `
## Soul — A Personalidade do Agente

O **Soul** é o system prompt do agente — define quem ele é, como fala, o que sabe e como age.

**Estrutura recomendada de um Soul:**
\`\`\`
# Identidade
Você é [Nome], [função] da [empresa].

# Personalidade
Seu tom é [profissional/casual/técnico/amigável].
Você é [direto/detalhado/criativo].

# Conhecimento
Você conhece: [domínios específicos].
Você NÃO fala sobre: [tópicos proibidos].

# Regras
- Sempre [comportamento 1]
- Nunca [comportamento 2]
- Quando [situação], faça [ação]

# Objetivo
Seu objetivo principal é [missão do agente].
\`\`\`

**Dicas:**
- Quanto mais específico o soul, melhor o comportamento
- Teste iterando — comece simples e refine
- Use a aba **Soul** no agente para editar e ver o histórico
        `
      },
      {
        title: 'Auto-configuração via chat',
        content: `
## Agentes se Auto-Configuram

O recurso mais poderoso do Lumi Plus: **agentes podem se configurar sozinhos** quando você fornece APIs ou documentação.

**Como funciona:**

1. Abra o Chat Web com o agente
2. Cole a documentação de uma API ou envie a chave
3. O agente:
   - Lê a documentação automaticamente
   - Salva a API key no vault seguro
   - Atualiza seu próprio soul com instruções de uso

**Exemplo real:**
\`\`\`
Você: "Aqui está minha API do GeraThumbs:
https://docs.gerarthumbs.com
Minha chave: sk-abc123"

Agente:
✅ Lendo documentação...
✅ Credencial "gerarthumbs_api_key" salva no vault
✅ Soul atualizado com instruções de uso da API
Agora consigo criar thumbnails para você!
\`\`\`

**Funciona em todos os canais:** Chat Web, Telegram, WhatsApp
        `
      },
      {
        title: 'Comandos de chat disponíveis',
        content: `
## Comandos via Chat (/)

Envie esses comandos em qualquer chat para controlar o sistema:

| Comando | O que faz |
|---------|-----------|
| \`/skills\` | Lista skills ativas do agente |
| \`/squad\` | Mostra a squad do agente |
| \`/squad add @agente\` | Adiciona membro à squad |
| \`/squad executar <tarefa>\` | Executa tarefa com a squad |
| \`/run <workflow>\` | Executa um workflow |
| \`/help\` | Lista todos os comandos |

**Exemplo:**
\`\`\`
/squad executar "Analise as últimas 10 vendas e gere um relatório resumido"
\`\`\`
        `
      },
    ]
  },
  {
    id: 'skills',
    icon: Sparkles,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    title: 'Skills & Marketplace',
    desc: 'Capacidades extras para seus agentes',
    articles: [
      {
        title: 'Instalando skills do Marketplace',
        content: `
## Marketplace de Skills

Skills são capacidades extras que você instala nos agentes. Acesse em **Skills** no menu lateral.

**Skills disponíveis:**

| Skill | O que faz |
|-------|-----------|
| 🔍 DuckDuckGo Search | Busca na web gratuitamente |
| 📧 Email Send | Envia emails via Brevo/SMTP |
| 📅 Google Calendar | Lê e cria eventos |
| 🗂️ Trello | Gerencia boards e cards |
| 💳 Stripe | Consulta clientes e saldo |
| 📝 Notion | Busca e cria páginas |
| 🔗 Call API | Chama qualquer API externa |
| ⚙️ Auto-Configuração | Agente se auto-configura |
| ⏰ Gerenciar Agendamentos | Cria cronjobs via chat |
| ⬇️ ClawhHub Import | Importa skills do marketplace |

**Como instalar:**
1. Vá em **Skills** → aba **Marketplace**
2. Encontre a skill desejada → **Ativar**
3. Se precisar de credenciais → configure na seção de configurações da skill
        `
      },
      {
        title: 'Importando skills do ClawhHub',
        content: `
## ClawhHub.ai — Marketplace Externo

O ClawhHub é um repositório aberto de skills para agentes IA. Você pode importar qualquer skill diretamente via chat.

**Como importar:**
\`\`\`
Você: "Importe essa skill:
https://clawhub.ai/MaTriXy/agent-browser-clawdbot"

Agente:
✅ SKILL.md obtido via GitHub
✅ Fragment "ClawhHub: MaTriXy/agent-browser-clawdbot" salvo
✅ Visível na aba Personalizadas do Marketplace
\`\`\`

**Para incorporar ao soul:**
\`\`\`
"Importe e aplique ao meu soul: https://clawhub.ai/..."
\`\`\`

A skill importada aparece na aba **Personalizadas** do Marketplace.
        `
      },
      {
        title: 'APIs personalizadas (BYOK)',
        content: `
## Bring Your Own Key (BYOK)

Você pode dar qualquer API para um agente e ele aprende a usá-la.

**Via chat:**
\`\`\`
"Minha API key do Ckato é: ck_live_abc123
Documentação: https://docs.ckato.com"
\`\`\`

**Via Configurações:** em **Configurações** você pode salvar chaves que ficam disponíveis para todos os agentes.

**Segurança:** todas as chaves são criptografadas com AES-256-GCM antes de serem salvas no banco.

**Ver APIs instaladas:** vá em **Skills** → aba **Personalizadas** para ver quais APIs foram auto-configuradas por quais agentes.
        `
      },
    ]
  },
  {
    id: 'workflows',
    icon: Workflow,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    title: 'Workflows & Squads',
    desc: 'Automações e times de agentes',
    articles: [
      {
        title: 'Criando um workflow',
        content: `
## Workflows — Fluxos de Automação

Workflows são sequências de ações que agentes executam automaticamente.

**Tipos de nós disponíveis:**
- **Agent** — executa um agente com um prompt
- **Condition** — ramifica o fluxo (se/senão)
- **SpawnAgent** — cria sub-agentes dinamicamente
- **Human Approval** — pausa e aguarda aprovação
- **Delay** — aguarda um tempo antes de continuar

**Como criar:**
1. Vá em **Workflows** → selecione um agente na sidebar
2. Clique **+ Novo Workflow**
3. No canvas, arraste nós e conecte-os
4. Configure cada nó com o prompt desejado
5. Salve e execute com o botão ▶

**Exemplo — Workflow de qualificação de lead:**
\`\`\`
Trigger → Agente Recepcionista (coleta dados)
       → Condition (lead qualificado?)
          ✓ → Agente Vendas (envia proposta)
          ✗ → Agente Suporte (encaminha FAQ)
\`\`\`
        `
      },
      {
        title: 'Squads — Times de Agentes',
        content: `
## Squads

Squads são grupos de agentes que trabalham juntos em tarefas complexas.

**Como funciona:**
- Cada agente tem sua própria squad
- Um agente é o **líder**, os outros são **membros**
- O líder delega tarefas para os membros
- Resultados são consolidados pelo líder

**Criando uma squad via chat:**
\`\`\`
/squad add Agente-Pesquisa
/squad add Agente-Redacao
/squad executar "Pesquise sobre IA em 2025 e escreva um artigo"
\`\`\`

**Criando uma squad via Workflows:**
- Adicione nós de agente diferentes no canvas
- Conecte-os em sequência ou paralelo
- O workflow gerencia a coordenação automaticamente
        `
      },
      {
        title: 'Agendamentos automáticos (CronJobs)',
        content: `
## CronJobs via Chat

Seus agentes podem criar agendamentos automáticos diretamente por conversa.

**Exemplos:**
\`\`\`
"Me mande um resumo de leads todo dia às 9h"
→ Cron criado: "0 9 * * *"

"Toda segunda às 8h verifique as métricas"
→ Cron criado: "0 8 * * 1"

"A cada hora confira novos pedidos"
→ Cron criado: "0 * * * *"
\`\`\`

**Gerenciar agendamentos:**
\`\`\`
"Quais são meus agendamentos?"
→ Lista todos os crons ativos

"Cancela o lembrete de leads"
→ Remove o cron

"Executa o relatório agora"
→ Roda manualmente
\`\`\`

**Expressões Cron:**
| Expressão | Quando |
|-----------|--------|
| \`0 9 * * *\` | Todo dia às 9h |
| \`0 9 * * 1\` | Toda segunda às 9h |
| \`*/30 * * * *\` | A cada 30 minutos |
| \`0 18 * * 1-5\` | Dias úteis às 18h |
        `
      },
    ]
  },
  {
    id: 'conhecimento',
    icon: Brain,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    title: 'Knowledge Hub',
    desc: 'Base de conhecimento dos agentes',
    articles: [
      {
        title: 'Adicionando conhecimento ao agente',
        content: `
## Knowledge Hub — Base de Conhecimento

O Knowledge Hub permite que agentes tenham acesso a documentos, manuais e informações específicas.

**Formatos suportados:**
- Arquivos **.md** (Markdown)
- Arquivos **.txt** (texto simples)
- Texto colado manualmente (injeção direta)

**Como adicionar:**
1. Vá em **Conhecimento** → selecione o agente
2. Arraste arquivos .md ou .txt na área de upload
3. Ou clique em **Injetar Manualmente** e cole o texto
4. O sistema processa e indexa automaticamente

**Busca semântica (RAG):**
Com PostgreSQL + pgvector, o sistema usa embeddings para buscar o trecho mais relevante da base de conhecimento antes de responder.

**Dica:** Use um SOUL.md para definir a identidade do agente e fragmentos separados para cada área de conhecimento (ex: "Produtos", "FAQ", "Políticas").
        `
      },
      {
        title: 'Usando a busca na web',
        content: `
## Busca Web em Tempo Real

Agentes com a skill **DuckDuckGo Search** ou **Brave Search** podem buscar na internet.

**DuckDuckGo (gratuito, sem chave):**
- Instalado por padrão
- Usa Google como fonte primária, DuckDuckGo como fallback
- Ideal para perguntas gerais

**Brave Search (requer chave):**
- Mais preciso e com menos censura
- Obtenha uma chave em [brave.com/search/api](https://brave.com/search/api)
- Configure em **Configurações** → **Brave Search API Key**

**Como o agente usa:**
O agente decide automaticamente quando buscar na web. Você também pode pedir explicitamente:
\`\`\`
"Pesquise as últimas notícias sobre IA no Brasil"
"Qual o preço atual do dólar?"
"Busque o manual do produto X"
\`\`\`
        `
      },
    ]
  },
  {
    id: 'exemplos',
    icon: PlayCircle,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    title: 'Exemplos Práticos',
    desc: 'Casos de uso reais e receitas prontas',
    articles: [
      {
        title: 'Bot de atendimento ao cliente',
        content: `
## Receita: Bot de Atendimento ao Cliente

**O que vai precisar:**
- 1 agente configurado com soul de atendimento
- Canal Telegram ou WhatsApp conectado
- Base de conhecimento com FAQ e políticas

**Soul sugerido:**
\`\`\`
Você é a Sofia, assistente de atendimento da [Empresa].
Tom: profissional, empático e objetivo.

Você responde dúvidas sobre:
- Status de pedidos
- Política de trocas e devoluções
- Informações sobre produtos

Quando não souber a resposta, diga "Vou verificar isso para você" e
peça o número do pedido ou contato do cliente.

NUNCA invente informações. Se não tiver certeza, peça para aguardar.
\`\`\`

**Skills recomendadas:**
- ✅ DuckDuckGo Search (para buscar informações atuais)
- ✅ Email Send (para enviar confirmações)
- ✅ Inline Buttons (para menus interativos)

**Configuração de grupos:**
Se for usar em grupo do WhatsApp/Telegram, configure para responder apenas quando mencionado (@sofia) para não ser invasivo.
        `
      },
      {
        title: 'Assistente de vendas com CRM',
        content: `
## Receita: Assistente de Vendas com API

**Cenário:** Agente que consulta seu CRM e agenda follow-ups automaticamente.

**Passo 1 — Configurar API do CRM via chat:**
\`\`\`
"Minha API do CRM é: https://api.meucrm.com
Chave: crm_key_abc123
Documentação: https://docs.meucrm.com"
\`\`\`
O agente lê a doc e aprende a usar a API.

**Passo 2 — Criar agendamento diário:**
\`\`\`
"Todo dia às 8h verifique os leads sem follow-up
nos últimos 3 dias e me mande um resumo no Telegram"
\`\`\`

**Passo 3 — Ativar skill de email:**
\`\`\`
"Instale a skill de email e configure com
smtp_host=smtp.brevo.com, smtp_user=vendas@empresa.com,
smtp_pass=minha_senha_brevo"
\`\`\`

**Resultado:** Agente consulta CRM diariamente, envia resumo no Telegram e manda emails de follow-up automaticamente.
        `
      },
      {
        title: 'Squad de criação de conteúdo',
        content: `
## Receita: Squad de Criação de Conteúdo

**Agentes necessários:**
1. **Pesquisador** — busca tendências e dados
2. **Redator** — escreve o conteúdo
3. **Revisor** — verifica qualidade e tom

**Workflow no canvas:**
\`\`\`
[Trigger: tema do conteúdo]
        ↓
[Pesquisador: busca dados sobre o tema]
        ↓
[Redator: escreve artigo com os dados]
        ↓
[Revisor: verifica e aprova ou pede revisão]
        ↓
[Human Approval: você aprova antes de publicar]
        ↓
[Publicação]
\`\`\`

**Executar via chat:**
\`\`\`
/squad executar "Crie um artigo sobre tendências de IA em 2025 para o LinkedIn"
\`\`\`

**Resultado:** Artigo completo, pesquisado e revisado em minutos.
        `
      },
    ]
  },
];

// ── Componente Principal ───────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeArticle, setActiveArticle] = useState<{ catId: string; idx: number } | null>(null);

  const filtered = CATEGORIES.map(cat => ({
    ...cat,
    articles: cat.articles.filter(a =>
      !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => !search || cat.articles.length > 0);

  const currentArticle = activeArticle
    ? CATEGORIES.find(c => c.id === activeArticle.catId)?.articles[activeArticle.idx]
    : null;

  return (
    <div className="max-w-5xl mx-auto p-6 pt-10 pb-20 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-black text-xl uppercase tracking-tighter italic">
                Central de <span className="text-primary italic">Ajuda</span>
              </h1>
            </div>
          </div>
          <p className="text-sm text-foreground/50 max-w-xl">
            Guias, exemplos e receitas para tirar o máximo do Lumi Plus.
          </p>
        </div>
        <Link href="/settings" className="text-xs font-bold uppercase tracking-widest text-foreground/40 hover:text-primary transition-colors flex items-center gap-1">
          <Settings className="w-3.5 h-3.5" /> Configurações
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setActiveArticle(null); }}
          placeholder="Buscar artigos, exemplos, comandos..."
          className="w-full h-11 pl-10 pr-4 bg-surface border border-border-strong focus:border-primary focus:outline-none text-sm transition-colors"
          style={{ borderRadius: 0 }}
        />
      </div>

      {/* Article view */}
      {currentArticle ? (
        <div className="space-y-4">
          <button
            onClick={() => setActiveArticle(null)}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/40 hover:text-primary transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Voltar
          </button>

          <div className="industrial-card">
            <h2 className="font-black text-lg mb-4">{currentArticle.title}</h2>
            <div className="prose prose-sm prose-invert max-w-none space-y-4 text-foreground/80">
              {currentArticle.content.trim().split('\n').map((line, i) => {
                if (line.startsWith('## ')) return <h3 key={i} className="font-black text-base text-foreground mt-6 mb-2">{line.replace('## ', '')}</h3>;
                if (line.startsWith('# ')) return <h2 key={i} className="font-black text-lg text-foreground mt-6 mb-2">{line.replace('# ', '')}</h2>;
                if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-foreground">{line.replace(/\*\*/g, '')}</p>;
                if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-primary pl-3 text-foreground/60 italic text-sm">{line.replace('> ', '')}</blockquote>;
                if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{line.replace(/^[-*] /, '').replace(/\*\*(.*?)\*\*/g, '$1')}</li>;
                if (line.startsWith('```')) return <div key={i} className="bg-zinc-900 border border-border-strong px-3 py-0.5 text-xs font-mono text-primary/80" />;
                if (line.startsWith('|')) {
                  const cells = line.split('|').filter(Boolean).map(c => c.trim());
                  const isHeader = cells.every(c => c);
                  return (
                    <div key={i} className={`grid text-xs font-mono border-b border-border-strong py-1 ${isHeader ? 'text-foreground font-bold' : 'text-foreground/70'}`}
                      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
                      {cells.map((c, j) => <span key={j} className="px-2">{c.replace(/\*\*(.*?)\*\*/g, '$1')}</span>)}
                    </div>
                  );
                }
                if (!line.trim()) return <div key={i} className="h-1" />;
                return <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: line.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 text-orange-400 text-xs rounded">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Category grid */
        <div className="space-y-6">
          {filtered.map(cat => {
            const Icon = cat.icon;
            const isOpen = activeCategory === cat.id;
            return (
              <div key={cat.id} className="industrial-card p-0 overflow-hidden">
                <button
                  onClick={() => setActiveCategory(isOpen ? null : cat.id)}
                  className="w-full flex items-center gap-4 p-5 hover:bg-foreground/3 transition-colors text-left"
                >
                  <div className={`w-10 h-10 ${cat.bg} border ${cat.border} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${cat.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm uppercase tracking-widest">{cat.title}</p>
                    <p className="text-xs text-foreground/50 mt-0.5">{cat.desc}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">
                      {cat.articles.length} artigos
                    </span>
                    <ChevronDown className={`w-4 h-4 text-foreground/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border-strong divide-y divide-border-strong">
                    {cat.articles.map((article, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveArticle({ catId: cat.id, idx })}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/3 transition-colors text-left group"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-foreground/20 group-hover:text-primary transition-colors flex-shrink-0" />
                        <span className="text-sm text-foreground/70 group-hover:text-foreground transition-colors">{article.title}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-foreground/20 group-hover:text-primary transition-colors ml-auto flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <AlertCircle className="w-8 h-8 text-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-foreground/40">Nenhum artigo encontrado para "{search}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

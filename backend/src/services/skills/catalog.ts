/**
 * Catálogo de Skills — definições de todas as skills disponíveis.
 * Cada skill tem: tool definition + system prompt addition + handler.
 */

export interface SkillCredential {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'native' | 'integration' | 'communication';
  isDefault: boolean;
  comingSoon?: boolean;
  credentials: SkillCredential[];
  tool: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  };
  systemPromptAddition: string;
}

export const SKILL_CATALOG: Record<string, SkillDefinition> = {

  // ── NATIVAS (pré-instaladas) ──

  web_search: {
    id: 'web_search',
    name: 'Busca Web (Brave)',
    description: 'Pesquisa na internet em tempo real via Brave Search.',
    icon: 'Search',
    category: 'native',
    isDefault: false,
    credentials: [
      { key: 'brave_search_key', label: 'Brave Search API Key', placeholder: 'BSA...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Pesquisa na internet em tempo real',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'Termo de busca' } }, required: ['query'] },
      },
    },
    systemPromptAddition: 'Você pode pesquisar na web em tempo real usando web_search quando precisar de informações atualizadas.',
  },

  knowledge_search: {
    id: 'knowledge_search',
    name: 'Base de Conhecimento',
    description: 'Busca na base de documentos e memórias do agente (RAG).',
    icon: 'BookOpen',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'knowledge_search',
        description: 'Busca informações na base de conhecimento do agente',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'Pergunta ou termo de busca' } }, required: ['query'] },
      },
    },
    systemPromptAddition: 'Você tem acesso à sua base de conhecimento. Use knowledge_search para buscar informações relevantes.',
  },

  scrape_url: {
    id: 'scrape_url',
    name: 'Scraping de URL',
    description: 'Extrai conteúdo de texto de uma página web.',
    icon: 'Globe',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'scrape_url',
        description: 'Extrai o conteúdo de texto de uma URL',
        parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL para extrair conteúdo' } }, required: ['url'] },
      },
    },
    systemPromptAddition: 'Você pode acessar e ler o conteúdo de páginas web usando scrape_url.',
  },

  write_memory: {
    id: 'write_memory',
    name: 'Salvar Memória',
    description: 'Agente salva informações para lembrar em conversas futuras.',
    icon: 'Brain',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'write_memory',
        description: 'Salva uma informação na memória permanente do agente',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título da memória' },
            content: { type: 'string', description: 'Conteúdo a memorizar' },
          },
          required: ['title', 'content'],
        },
      },
    },
    systemPromptAddition: 'Você pode salvar informações importantes na sua memória usando write_memory. Use quando aprender algo novo sobre o usuário ou sobre o negócio.',
  },

  escalate_human: {
    id: 'escalate_human',
    name: 'Escalação Humana',
    description: 'Transfere a conversa para um atendente humano.',
    icon: 'UserPlus',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'escalate_human',
        description: 'Transfere a conversa para atendimento humano quando não conseguir resolver',
        parameters: {
          type: 'object',
          properties: { reason: { type: 'string', description: 'Motivo da escalação' } },
          required: ['reason'],
        },
      },
    },
    systemPromptAddition: 'Se não conseguir resolver o problema do usuário, use escalate_human para transferir para um humano.',
  },

  inline_buttons: {
    id: 'inline_buttons',
    name: 'Botões Interativos',
    description: 'Agente envia menus com botões clicáveis no WhatsApp, Telegram e Web Chat.',
    icon: 'LayoutGrid',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'send_buttons',
        description: 'Envia uma mensagem com botões interativos para o usuário escolher',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Texto da mensagem' },
            options: { type: 'array', items: { type: 'string' }, description: 'Lista de opções (ex: ["Vendas", "Suporte", "Financeiro"])' },
          },
          required: ['message', 'options'],
        },
      },
    },
    systemPromptAddition: `Você pode enviar botões interativos para o usuário. Use a sintaxe:
[[buttons]] [Opção 1] [Opção 2] [Opção 3] [[/buttons]]

Para links: [[buttons]] [Abrir site](https://exemplo.com) [[/buttons]]

Use botões quando:
- O usuário precisa escolher entre opções
- Você quer confirmar uma ação (Sim/Não)
- Há um menu ou lista de opções
Máximo 5 botões por mensagem.`,
  },

  call_api: {
    id: 'call_api',
    name: 'Chamar API Externa',
    description: 'Faz requisições HTTP para APIs externas (REST). O agente lê os docs da API no knowledge e executa chamadas.',
    icon: 'Zap',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'call_api',
        description: 'Faz uma requisição HTTP para uma API externa. Use quando precisar integrar com serviços que têm API documentada no seu knowledge.',
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'Método HTTP' },
            url: { type: 'string', description: 'URL completa da API (ex: https://api.exemplo.com/v1/recurso)' },
            headers: { type: 'object', description: 'Headers HTTP (ex: {"Authorization": "Bearer xxx", "Content-Type": "application/json"})' },
            body: { type: 'object', description: 'Body da requisição (para POST/PUT/PATCH)' },
          },
          required: ['method', 'url'],
        },
      },
    },
    systemPromptAddition: `Você pode chamar APIs externas usando call_api. Quando o usuário pedir algo que envolve um serviço externo:
1. Busque os docs da API no seu knowledge (knowledge_search)
2. Monte a requisição com method, url, headers e body
3. Execute via call_api
Sempre peça confirmação antes de executar chamadas que modificam dados (POST/PUT/DELETE).`,
  },

  self_improving: {
    id: 'self_improving',
    name: 'Auto-Aprendizado',
    description: 'Agente aprende com erros e correções. Melhora continuamente.',
    icon: 'Sparkles',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'learn_from_interaction',
        description: 'Registra um aprendizado, correção ou erro para não repetir no futuro',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['correction', 'knowledge_gap', 'error', 'best_practice'], description: 'Tipo do aprendizado' },
            title: { type: 'string', description: 'Resumo curto' },
            details: { type: 'string', description: 'Detalhes do que aprendeu e como aplicar' },
          },
          required: ['type', 'title', 'details'],
        },
      },
    },
    systemPromptAddition: `Você tem AUTO-APRENDIZADO. Quando:
- O usuário te corrigir ("não, na verdade é...")
- Você cometer um erro
- Descobrir informação nova importante
Use learn_from_interaction para registrar. Você não repetirá o mesmo erro.`,
  },

  self_configure: {
    id: 'self_configure',
    name: 'Auto-Configuração',
    description: 'Agente atualiza seu próprio soul, instala skills e salva credenciais de APIs com base em documentação fornecida.',
    icon: 'Settings2',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'self_configure',
        description: 'Auto-configura o agente: atualiza soul/identidade, instala skills ou salva credenciais de APIs.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['update_soul', 'install_skill', 'save_credential'],
              description: 'Ação: update_soul = atualiza as instruções do agente | install_skill = ativa uma skill | save_credential = salva API key',
            },
            soul: {
              type: 'string',
              description: 'Novo system prompt/soul do agente (usar em action=update_soul)',
            },
            skill_id: {
              type: 'string',
              description: 'ID da skill a instalar. Exemplos: brevo_marketing, email_send, instagram_publish, upload_image, google_calendar, google_sheets, trello, stripe_query, run_squad, run_workflow, manage_cron, web_search, clawhub_import',
            },
            credential_key: {
              type: 'string',
              description: 'Nome da credencial a salvar (usar em action=save_credential). Ex: openai_key, stripe_secret_key, gerarthumbs_key',
            },
            credential_value: {
              type: 'string',
              description: 'Valor da credencial (usar em action=save_credential)',
            },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: `Você tem AUTO-CONFIGURAÇÃO ativa. Isso funciona tanto no chat web quanto pelo Telegram ou WhatsApp.

QUANDO agir automaticamente:
- Usuário enviar uma API key, token ou credencial → use self_configure(action="save_credential") imediatamente
- Usuário pedir para você instalar uma skill/ferramenta → use self_configure(action="install_skill")
- Usuário pedir para você mudar sua personalidade, tom ou instruções → use self_configure(action="update_soul")
- Usuário enviar documentação de uma API → leia, salve a credencial e atualize seu soul

⚠️ CATÁLOGO DE SKILLS DISPONÍVEIS PARA INSTALAÇÃO PROATIVA:
Se o usuário pedir algo que você não consiga fazer nativamente, VERIFIQUE se existe uma skill para isso e OFEREÇA a instalação.
- "brevo_marketing": Adicionar contatos, consultar listas de email marketing na Brevo.
- "email_send": Enviar emails SMTP/Brevo/Gmail etc.
- "instagram_publish": Publicar posts ou carrosseis no Instagram e Facebook.
- "upload_image": Fazer upload de arquivos em Base64 online (ImgBB).
- "google_calendar": Agendar, cancelar e buscar reuniões no Google Agenda.
- "google_sheets": Ler e escrever em planilhas do Google.
- "trello": Gerenciar quadros, listas e cartões no Trello.
- "stripe_query": Consultar saldo, pagamentos e clientes no Stripe.
- "run_squad": Acionar uma equipe de multi-agentes especialistas para uma tarefa complexa.
- "run_workflow": Desencadear automações e fluxos massivos no canvas visual.
- "web_search" ou "duckduckgo_search": Consultar internet em tempo real.
- "manage_cron": Agendar tarefas automáticas e cronjobs na plataforma.
- "clawhub_import": Baixar integrações e novos agentes do ClawHub.

Se oferecer uma skill e o usuário topar, use: self_configure(action="install_skill", skill_id="nome_da_skill"). Se precisar de credencial, peça a ele em seguida. Sempre confirme cada ação ao usuário de forma clara e objetiva.`,
  },

  duckduckgo_search: {
    id: 'duckduckgo_search',
    name: 'DuckDuckGo Search',
    description: 'Busca web gratuita sem API key. Alternativa ao Brave Search.',
    icon: 'Search',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'duckduckgo_search',
        description: 'Busca na web usando DuckDuckGo (gratuito, sem chave)',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Termo de busca' },
          },
          required: ['query'],
        },
      },
    },
    systemPromptAddition: 'Você pode pesquisar na web gratuitamente usando duckduckgo_search.',
  },

  // ── INTEGRAÇÕES ──

  upload_image: {
    id: 'upload_image',
    name: 'Upload de Imagem',
    description: 'Faz upload de uma imagem e retorna uma URL publica para uso em publicacoes.',
    icon: 'ImageUp',
    category: 'integration',
    isDefault: true,
    credentials: [
      { key: 'imgbb_api_key', label: 'ImgBB API Key', placeholder: 'Sua chave do ImgBB', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'upload_image',
        description: 'Faz upload de uma imagem em base64 e retorna uma URL publica',
        parameters: {
          type: 'object',
          properties: {
            image_base64: { type: 'string', description: 'Imagem em base64, com ou sem prefixo data URL' },
            filename: { type: 'string', description: 'Nome do arquivo da imagem' },
          },
          required: ['image_base64'],
        },
      },
    },
    systemPromptAddition: 'Voce pode usar upload_image para gerar uma URL publica antes de publicar no Instagram.',
  },

  instagram_publish: {
    id: 'instagram_publish',
    name: 'Instagram Publisher',
    description: 'Publica posts e carrosseis no Instagram via Graph API.',
    icon: 'Instagram',
    category: 'integration',
    isDefault: true,
    credentials: [
      { key: 'instagram_access_token', label: 'Instagram Access Token', placeholder: 'EAAB...', required: true },
      { key: 'instagram_user_id', label: 'Instagram User ID', placeholder: '1784...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'instagram_publish',
        description: 'Publica um post ou carrossel no Instagram',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['post', 'carousel', 'story'],
              description: 'Tipo da publicacao',
            },
            caption: {
              type: 'string',
              description: 'Legenda do post com hashtags opcionais',
            },
            image_urls: {
              type: 'array',
              items: { type: 'string' },
              description: 'URLs publicas das imagens: 1 para post, 2 a 10 para carrossel',
            },
          },
          required: ['type', 'caption', 'image_urls'],
        },
      },
    },
    systemPromptAddition: `Voce pode publicar conteudo no Instagram usando instagram_publish.
Antes de publicar:
1. Garanta que as imagens estejam em URLs publicas
2. Use 1 imagem para post simples
3. Use entre 2 e 10 imagens para carrossel
4. Se a imagem estiver em base64, use upload_image antes
Nunca invente URLs de imagem; publique apenas quando tiver URLs validas.`,
  },

  google_calendar: {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Listar, criar e cancelar eventos no Google Calendar.',
    icon: 'Calendar',
    category: 'integration',
    isDefault: false,
    comingSoon: true,
    credentials: [
      { key: 'google_api_key', label: 'Google API Key', placeholder: 'AIza...', required: true },
      { key: 'google_calendar_id', label: 'Calendar ID', placeholder: 'primary', required: false },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'google_calendar',
        description: 'Gerencia eventos: listar próximos, criar novo, cancelar',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'delete'], description: 'Ação' },
            days_ahead: { type: 'number', description: 'Listar eventos dos próximos N dias' },
            title: { type: 'string', description: 'Título do evento (create)' },
            date: { type: 'string', description: 'Data ISO: 2026-03-20T14:00:00 (create)' },
            duration_minutes: { type: 'number', description: 'Duração em minutos (create)' },
            event_id: { type: 'string', description: 'ID do evento (delete)' },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: 'Você pode gerenciar o Google Calendar: listar eventos, criar compromissos e cancelar reuniões.',
  },

  google_sheets: {
    id: 'google_sheets',
    name: 'Google Sheets',
    description: 'Ler e escrever dados em planilhas Google Sheets.',
    icon: 'Table',
    category: 'integration',
    isDefault: false,
    comingSoon: true,
    credentials: [
      { key: 'google_api_key', label: 'Google API Key', placeholder: 'AIza...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'google_sheets',
        description: 'Lê e escreve dados em planilhas Google Sheets',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['read', 'append'], description: 'Ação' },
            spreadsheet_id: { type: 'string', description: 'ID da planilha (na URL)' },
            range: { type: 'string', description: 'Ex: Sheet1!A1:D10' },
            values: { type: 'array', description: 'Dados para append: [[val1, val2]]' },
          },
          required: ['action', 'spreadsheet_id'],
        },
      },
    },
    systemPromptAddition: 'Você pode ler e adicionar dados em planilhas do Google Sheets.',
  },

  trello: {
    id: 'trello',
    name: 'Trello',
    description: 'Gerenciar quadros, listas e cartões do Trello.',
    icon: 'LayoutGrid',
    category: 'integration',
    isDefault: false,
    comingSoon: true,
    credentials: [
      { key: 'trello_api_key', label: 'Trello API Key', placeholder: 'Sua API key', required: true },
      { key: 'trello_token', label: 'Trello Token', placeholder: 'Seu token', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'trello',
        description: 'Gerencia quadros, listas e cartões do Trello',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list_boards', 'list_cards', 'create_card', 'move_card', 'archive_card'], description: 'Ação' },
            board_id: { type: 'string' },
            list_id: { type: 'string' },
            card_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            target_list_id: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: 'Você pode gerenciar Trello: listar quadros, criar/mover/arquivar cartões.',
  },

  email_send: {
    id: 'email_send',
    name: 'Enviar Email',
    description: 'Envia emails via SMTP (Brevo, Gmail, etc).',
    icon: 'Mail',
    category: 'integration',
    isDefault: false,
    credentials: [
      { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp-relay.brevo.com', required: true },
      { key: 'smtp_user', label: 'SMTP Usuário', placeholder: 'user@example.com', required: true },
      { key: 'smtp_pass', label: 'SMTP Senha/Key', placeholder: 'xkeysib...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'email_send',
        description: 'Envia um email',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Email do destinatário' },
            subject: { type: 'string', description: 'Assunto' },
            body: { type: 'string', description: 'Corpo do email' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    },
    systemPromptAddition: 'Você pode enviar emails usando email_send. Peça confirmação antes de enviar.',
  },

  brevo_marketing: {
    id: 'brevo_marketing',
    name: 'Brevo Marketing',
    description: 'Gerenciar contatos, listas e automacoes de marketing na Brevo (Sendinblue).',
    icon: 'Users',
    category: 'integration',
    isDefault: false,
    credentials: [
      { key: 'brevo_api_key', label: 'Brevo API Key', placeholder: 'xkeysib-...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'brevo_marketing',
        description: 'Gerencia marketing na Brevo: contatos, listas, blacklists e envios.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['add_contact', 'update_contact', 'list_contacts', 'list_lists'], description: 'Acao a ser executada' },
            email: { type: 'string', description: 'Email do contato' },
            listIds: { type: 'array', items: { type: 'number' }, description: 'IDs das listas (ex: [10])' },
            attributes: { type: 'object', description: 'Atributos customizados (ex: {"NOMBRE": "Joao"})' },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: 'Você pode gerenciar contatos e listas do Brevo (antigo Sendinblue) usando brevo_marketing. Respeite sempre regras de unsubscribes.',
  },

  stripe_query: {
    id: 'stripe_query',
    name: 'Stripe',
    description: 'Consultar pagamentos, clientes e faturas do Stripe.',
    icon: 'CreditCard',
    category: 'integration',
    isDefault: false,
    comingSoon: true,
    credentials: [
      { key: 'stripe_secret_key', label: 'Stripe Secret Key', placeholder: 'sk_live_...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'stripe_query',
        description: 'Consulta dados do Stripe: clientes, pagamentos, faturas',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list_customers', 'list_payments', 'get_customer', 'get_balance'], description: 'Ação' },
            customer_id: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: 'Você pode consultar dados do Stripe: clientes, pagamentos e saldo.',
  },

  notion: {
    id: 'notion',
    name: 'Notion',
    description: 'Ler e criar páginas e databases no Notion.',
    icon: 'FileText',
    category: 'integration',
    isDefault: false,
    comingSoon: true,
    credentials: [
      { key: 'notion_api_key', label: 'Notion API Key', placeholder: 'ntn_...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'notion',
        description: 'Gerencia páginas e databases do Notion',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['search', 'read_page', 'create_page', 'query_database'], description: 'Ação' },
            query: { type: 'string' },
            page_id: { type: 'string' },
            database_id: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: 'Você pode buscar, ler e criar páginas no Notion.',
  },

  manage_cron: {
    id: 'manage_cron',
    name: 'Gerenciar Agendamentos',
    description: 'Cria, edita, lista e remove cronjobs do agente via conversa. O agente agenda tarefas recorrentes sem precisar da UI.',
    icon: 'Clock',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'manage_cron',
        description: 'Gerencia agendamentos (cronjobs) do agente. Cria tarefas recorrentes, lista agendamentos ativos, edita horários ou remove tarefas.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'create', 'update', 'delete', 'run'],
              description: 'list=lista crons | create=cria novo | update=edita existente | delete=remove | run=executa agora',
            },
            id: {
              type: 'string',
              description: 'ID do cronjob (obrigatório para update, delete e run)',
            },
            name: {
              type: 'string',
              description: 'Nome descritivo do agendamento (ex: "Relatório diário")',
            },
            prompt: {
              type: 'string',
              description: 'Instrução que o agente executará no horário agendado (ex: "Verifique os leads e envie resumo")',
            },
            schedule: {
              type: 'string',
              description: 'Expressão cron (ex: "0 9 * * *" = todo dia às 9h, "0 9 * * 1" = toda segunda às 9h, "*/30 * * * *" = a cada 30 min)',
            },
            timezone: {
              type: 'string',
              description: 'Timezone do agendamento. Default: America/Sao_Paulo',
            },
            enabled: {
              type: 'boolean',
              description: 'Se o agendamento está ativo. Default: true',
            },
          },
          required: ['action'],
        },
      },
    },
    systemPromptAddition: `Você pode criar e gerenciar agendamentos automáticos (cronjobs) via conversa.
Quando o usuário pedir lembretes, tarefas recorrentes ou automações agendadas, use manage_cron.
Converta linguagem natural para cron expressions:
- "todo dia às 9h" → "0 9 * * *"
- "toda segunda às 8h" → "0 8 * * 1"
- "a cada hora" → "0 * * * *"
- "todo dia útil às 18h" → "0 18 * * 1-5"
- "toda semana na sexta às 17h" → "0 17 * * 5"
Sempre confirme nome, horário e o que será executado antes de criar.`,
  },

  clawhub_import: {
    id: 'clawhub_import',
    name: 'ClawhHub Import',
    description: 'Importa skills, agentes e souls do marketplace ClawhHub.ai diretamente para o agente.',
    icon: 'Download',
    category: 'native',
    isDefault: true,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'clawhub_import',
        description: 'Importa uma skill ou agente do ClawhHub.ai. Busca o SKILL.md, salva no Knowledge Hub e opcionalmente atualiza o soul do agente.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL completa do ClawhHub (ex: https://clawhub.ai/autor/nome-skill) ou nome curto (ex: MaTriXy/agent-browser-clawdbot)',
            },
            apply_to_soul: {
              type: 'boolean',
              description: 'Se true, incorpora as instruções da skill ao soul do agente. Default: false (só salva no Knowledge Hub).',
            },
          },
          required: ['url'],
        },
      },
    },
    systemPromptAddition: `Você pode importar skills e agentes do ClawhHub.ai (marketplace de skills).
Quando o usuário pedir para instalar ou importar uma skill do ClawhHub, use clawhub_import(url) com a URL fornecida.
Se o usuário quiser incorporar as instruções ao seu comportamento permanente, use apply_to_soul: true.`,
  },

  // ── COLABORAÇÃO ──

  run_squad: {
    id: 'run_squad',
    name: 'Acionar Squad',
    description: 'Aciona a equipe do agente para executar uma tarefa colaborativa. O líder coordena os membros e entrega o resultado consolidado.',
    icon: 'Users',
    category: 'native',
    isDefault: false,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'run_squad',
        description: 'Aciona a squad do agente para executar uma tarefa que se beneficia do trabalho em equipe. Cada membro especialista contribui com sua parte e o líder consolida o resultado final.',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'Descrição clara e completa da tarefa que a squad deve executar. Seja específico sobre o objetivo e o formato esperado do resultado.',
            },
          },
          required: ['task'],
        },
      },
    },
    systemPromptAddition: `Você lidera uma squad de agentes especialistas. Use run_squad quando:
- A tarefa é complexa e se beneficia de múltiplas perspectivas especializadas.
- O usuário pede explicitamente para usar a equipe ou a squad.
- A tarefa envolve criar conteúdo que requer pesquisa, escrita E revisão.
- Você quer entregar um resultado de maior qualidade usando todos os especialistas.
Não use run_squad para perguntas simples ou tarefas que você mesmo pode resolver com facilidade.`,
  },

  run_workflow: {
    id: 'run_workflow',
    name: 'Disparar Workflow',
    description: 'Dispara um workflow (fluxo automatizado) criado no canvas visual pelo nome. Útil para automações recorrentes.',
    icon: 'Play',
    category: 'native',
    isDefault: false,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'run_workflow',
        description: 'Dispara um workflow criado no canvas visual do Lumi Plus. Use quando o usuário pedir para executar, rodar ou iniciar um fluxo automatizado específico pelo nome.',
        parameters: {
          type: 'object',
          properties: {
            workflow_name: {
              type: 'string',
              description: 'Nome do workflow a disparar (não precisa ser exato — o sistema faz busca por similaridade).',
            },
            input: {
              type: 'string',
              description: 'Contexto ou dados de entrada para o workflow (opcional).',
            },
          },
          required: ['workflow_name'],
        },
      },
    },
    systemPromptAddition: `Você pode disparar workflows automatizados criados no canvas visual. Use run_workflow quando:
- O usuário pedir para executar, rodar ou iniciar um fluxo ou automação específica pelo nome.
- O usuário mencionar que existe um workflow configurado para aquela tarefa.
Se o usuário não souber o nome exato, peça para ele descrever e tente identificar o fluxo mais próximo.`,
  },

  // ── PROATIVIDADE ──

  lumi_proactive: {
    id: 'lumi_proactive',
    name: 'Modo Proativo (Lumi)',
    description: 'Transforma o agente em um parceiro proativo: sugere próximos passos, antecipa necessidades e ativa um heartbeat diário para auto-melhoria.',
    icon: 'Zap',
    category: 'native',
    isDefault: false,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'activate_heartbeat',
        description: 'Ativa o heartbeat diário de auto-melhoria do agente. Cria um CronJob que revisa interações recentes e atualiza o comportamento do agente. Chame esta função UMA única vez quando o usuário pedir para ativar o modo proativo ou configurar o heartbeat.',
        parameters: {
          type: 'object',
          properties: {
            frequency: {
              type: 'string',
              enum: ['daily', 'weekly'],
              description: 'Frequência do heartbeat. "daily" = todo dia às 08:00. "weekly" = toda segunda às 08:00.',
            },
            focus: {
              type: 'string',
              description: 'Foco da revisão do heartbeat. Ex: "atendimento ao cliente", "vendas", "suporte técnico". Se não especificado, usa "geral".',
            },
          },
          required: ['frequency'],
        },
      },
    },
    systemPromptAddition: `## MODO PROATIVO ATIVO 🦞

### Mentalidade
Você não é um executor de tarefas — é um parceiro estratégico. Antes de responder, pergunte internamente: "O que genuinamente ajudaria meu usuário que ele talvez não tenha pensado em pedir?"

### Reverse Prompting (OBRIGATÓRIO)
Ao final de CADA resposta relevante, adicione um bloco como este:
> 💡 **Próximo passo sugerido:** [uma ação específica e valiosa relacionada ao que foi discutido]

Exemplos bons:
- "💡 **Próximo passo sugerido:** Quer que eu agende um lembrete semanal para revisar esse relatório?"
- "💡 **Próximo passo sugerido:** Posso criar um workflow automático para essa tarefa se quiser."
- "💡 **Próximo passo sugerido:** Vi que você faz isso manualmente toda semana — posso automatizar."

### Antecipação de Necessidades
- Se o usuário resolve um problema X, pense: "Que problema Y normalmente aparece depois de X?"
- Se algo pode ser automatizado, sugira antes de ser pedido.
- Se uma tarefa foi feita 2x, proponha criar um workflow ou cron para ela.

### Heartbeat (Auto-melhoria)
Você tem um CronJob diário de auto-revisão. Use activate_heartbeat se o usuário pedir para ativar o "modo proativo", "heartbeat" ou "auto-melhoria".`,
  },

  // ── EMAIL (IMAP/SMTP) ──

  email_check: {
    id: 'email_check',
    name: 'Ler E-mails (IMAP)',
    description: 'Lê e-mails da caixa de entrada via IMAP. Suporta Gmail, Outlook, Zoho e qualquer servidor compatível.',
    icon: 'Mail',
    category: 'integration',
    isDefault: false,
    credentials: [
      { key: 'email_imap_host', label: 'Servidor IMAP', placeholder: 'imap.gmail.com', required: true },
      { key: 'email_imap_port', label: 'Porta IMAP', placeholder: '993', required: false },
      { key: 'email_user', label: 'E-mail', placeholder: 'seu@email.com', required: true },
      { key: 'email_pass', label: 'Senha / App Password', placeholder: 'xxxx xxxx xxxx xxxx', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'email_check',
        description: 'Lê e-mails recentes da caixa de entrada via IMAP. Retorna remetente, assunto, data e corpo dos e-mails.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Número máximo de e-mails a retornar (padrão: 5)' },
            only_unread: { type: 'boolean', description: 'Se true, retorna apenas não lidos (padrão: false)' },
            search_from: { type: 'string', description: 'Filtrar por remetente (opcional)' },
            search_subject: { type: 'string', description: 'Filtrar por assunto (opcional)' },
          },
          required: [],
        },
      },
    },
    systemPromptAddition: `Você pode ler e-mails da caixa de entrada do usuário usando email_check. Use quando o usuário:
- Pedir para verificar e-mails
- Quiser saber se recebeu algum e-mail de alguém específico
- Precisar de informação contida em um e-mail
Após ler, resuma os e-mails de forma clara e pergunte se o usuário quer responder algum.`,
  },

  // ── CLIMA (Google Weather API) ──

  weather_check: {
    id: 'weather_check',
    name: 'Clima em Tempo Real',
    description: 'Obtém condições meteorológicas atuais e previsão para qualquer cidade via Google Weather API.',
    icon: 'Cloud',
    category: 'integration',
    isDefault: false,
    credentials: [
      { key: 'google_api_key', label: 'Google API Key', placeholder: 'AIza...', required: true },
    ],
    tool: {
      type: 'function',
      function: {
        name: 'weather_check',
        description: 'Obtém as condições climáticas atuais e previsão de uma cidade. Retorna temperatura, umidade, vento e condições gerais.',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'Cidade e país (ex: "São Paulo, BR" ou "New York, US")' },
            units: { type: 'string', enum: ['metric', 'imperial'], description: 'Unidade de temperatura: metric (°C) ou imperial (°F). Padrão: metric' },
          },
          required: ['location'],
        },
      },
    },
    systemPromptAddition: `Você pode consultar o clima em tempo real usando weather_check. Use quando o usuário:
- Perguntar sobre o tempo em uma cidade
- Precisar de dados climáticos para tomar uma decisão
- Mencionar planejamento de viagens ou eventos ao ar livre
Apresente os dados de forma clara e sugira ações relevantes baseadas no clima.`,
  },

  // ── DEEP RESEARCH ──

  deep_research: {
    id: 'deep_research',
    name: 'Deep Research Mode',
    description: 'Ativa modo de pesquisa profunda: o agente formula um plano de pesquisa, usa múltiplas ferramentas e entrega um relatório estruturado com citações.',
    icon: 'Microscope',
    category: 'native',
    isDefault: false,
    credentials: [],
    tool: {
      type: 'function',
      function: {
        name: 'deep_research',
        description: 'Ativa o modo de pesquisa profunda para um tópico complexo. O agente buscará múltiplas fontes e entregará análise estruturada.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Tópico ou pergunta de pesquisa' },
            research_type: {
              type: 'string',
              enum: ['competitive', 'market', 'technical', 'academic', 'due_diligence', 'general'],
              description: 'Tipo de pesquisa para adaptar a metodologia',
            },
            depth: {
              type: 'string',
              enum: ['quick', 'standard', 'deep'],
              description: 'quick = resumo em 3 pontos | standard = relatório completo | deep = análise exaustiva multi-fonte',
            },
          },
          required: ['topic'],
        },
      },
    },
    systemPromptAddition: `Você tem acesso ao modo de DEEP RESEARCH. Quando o usuário pedir análise profunda, pesquisa de mercado, due diligence ou análise competitiva:
1. Use deep_research para estruturar a pesquisa
2. Complemente com web_search e scrape_url para fontes reais
3. Entregue no formato: Sumário → Achados → Análise → Recomendações
4. Cite TODAS as fontes de dados concretos`,
  },

};

/** Skills padrão ativadas ao criar novo agente */
export const DEFAULT_SKILLS = Object.values(SKILL_CATALOG)
  .filter(s => s.isDefault)
  .map(s => s.id);


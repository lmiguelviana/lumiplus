# Fase 22: Compatibilidade com Frameworks Open-Source
Versão: 1.0 | Interoperabilidade & SDK de Skills

---

## Visão

O Lumi Plus deve ser **interoperável** com os principais frameworks de agentes da comunidade open-source. Isso permite que:
- Desenvolvedores integrem Lumi em projetos existentes
- Skills criadas para LangChain funcionem no Lumi
- Agentes Lumi sejam consumidos como ferramentas por CrewAI/AutoGen
- Qualquer linguagem possa criar skills via contrato webhook + OpenAPI

---

## 1. SDK de Skills Externas

### Contrato de uma Skill

Qualquer skill externa (em qualquer linguagem) deve implementar este contrato:

```typescript
// Contrato oficial de uma Lumi Skill
interface LumiSkill {
  name: string;           // identificador único, snake_case
  description: string;   // descrição para a IA decidir quando usar
  version: string;       // semver, ex: "1.0.0"
  inputSchema: {         // JSON Schema dos parâmetros de entrada
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
  outputSchema?: {       // JSON Schema da saída (opcional, para validação)
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
  };
  auth: {
    type: 'hmac_sha256' | 'bearer' | 'api_key' | 'none';
    header?: string;     // nome do header de autenticação
  };
  endpoint: string;      // URL do webhook POST
  timeoutSeconds?: number; // padrão: 30
}
```

### Exemplo de Skill em Python

```python
# skill_consulta_cnpj.py
from fastapi import FastAPI, Request, HTTPException
import hmac, hashlib, json

app = FastAPI()
LUMI_SECRET = "sua_chave_secreta"

@app.post("/skill/consulta_cnpj")
async def consulta_cnpj(request: Request):
    # 1. Verificar assinatura HMAC
    body = await request.body()
    signature = request.headers.get("X-Lumi-Signature", "")
    expected = hmac.new(LUMI_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(f"sha256={expected}", signature):
        raise HTTPException(status_code=401, detail="Assinatura inválida")

    # 2. Processar a skill
    params = json.loads(body)
    cnpj = params["cnpj"]
    result = fetch_receita_federal(cnpj)   # sua lógica aqui

    # 3. Retornar resultado estruturado
    return {
        "success": True,
        "data": {
            "razao_social": result["nome"],
            "situacao": result["situacao"],
            "endereco": result["logradouro"]
        }
    }

# Manifesto da skill (salvo como skill_manifest.json)
MANIFEST = {
    "name": "consulta_cnpj",
    "description": "Consulta dados de uma empresa pelo CNPJ na Receita Federal",
    "version": "1.0.0",
    "inputSchema": {
        "type": "object",
        "properties": {
            "cnpj": { "type": "string", "description": "CNPJ com ou sem formatação" }
        },
        "required": ["cnpj"]
    },
    "auth": { "type": "hmac_sha256", "header": "X-Lumi-Signature" },
    "endpoint": "https://minha-skill.com/skill/consulta_cnpj",
    "timeoutSeconds": 15
}
```

### Exemplo de Skill em Node.js

```typescript
// skill_enviar_nfe.ts (Express)
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const LUMI_SECRET = process.env.LUMI_SECRET!;

app.post('/skill/enviar_nfe', (req, res) => {
  // Verificar assinatura
  const sig = req.headers['x-lumi-signature'] as string;
  const body = JSON.stringify(req.body);
  const expected = `sha256=${crypto.createHmac('sha256', LUMI_SECRET).update(body).digest('hex')}`;
  if (sig !== expected) return res.status(401).json({ error: 'Unauthorized' });

  const { pedido_id, valor, cliente_cpf } = req.body;
  // ... emitir NF-e
  res.json({ success: true, data: { numero_nfe: '001/2026', chave: 'xxx' } });
});
```

---

## 2. Registro de Skills via CLI

```bash
# Registrar skill externa
lumi skill add \
  --name consulta_cnpj \
  --webhook https://minha-skill.com/skill/consulta_cnpj \
  --secret minha_chave_secreta \
  --description "Consulta CNPJ na Receita Federal"

# Ou via manifesto JSON
lumi skill add --manifest ./skill_manifest.json

# Listar skills registradas
lumi skill list

# Testar skill com payload de exemplo
lumi skill test consulta_cnpj --input '{"cnpj": "11.222.333/0001-44"}'

# Remover skill
lumi skill remove consulta_cnpj
```

### Schema no banco

```sql
CREATE TABLE tenant_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  version     TEXT DEFAULT '1.0.0',
  endpoint    TEXT NOT NULL,
  secret_hash TEXT,           -- hash do secret (nunca armazenar em plain)
  auth_type   TEXT DEFAULT 'hmac_sha256',
  input_schema JSONB NOT NULL,
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);
```

---

## 3. Adapter LangChain

Agentes Lumi podem ser usados como `Runnable` dentro de chains LangChain:

```python
# langchain_adapter.py
from langchain_core.runnables import RunnableLambda
import httpx, os

LUMI_API_URL = os.getenv("LUMI_API_URL", "http://localhost:3001")
LUMI_API_KEY = os.getenv("LUMI_API_KEY")

def lumi_agent(agent_name: str):
    """Cria um LangChain Runnable que chama um agente Lumi."""
    def _call(input_data: dict) -> dict:
        response = httpx.post(
            f"{LUMI_API_URL}/v1/agents/{agent_name}/invoke",
            json={"message": input_data.get("input", ""), "context": input_data},
            headers={"Authorization": f"Bearer {LUMI_API_KEY}"},
            timeout=60
        )
        return {"output": response.json()["response"]}
    return RunnableLambda(_call)

# Uso numa chain LangChain normal
from langchain_core.prompts import ChatPromptTemplate

chain = (
    ChatPromptTemplate.from_template("Analise: {input}")
    | lumi_agent("sofia")   # agente Lumi como Runnable
)

result = chain.invoke({"input": "Qual o status do pedido #123?"})
```

### Endpoint necessário no backend

```typescript
// POST /v1/agents/:name/invoke
// Endpoint compatível com LangChain Runnable
router.post('/agents/:name/invoke', async (req, res) => {
  const { message, context } = req.body;
  const agent = await agentService.findByName(req.params.name, req.tenantId);
  const result = await aiService.processMessage({
    agentId: agent.id,
    message,
    context,
    tenantId: req.tenantId
  });
  res.json({ response: result.text, metadata: { tokens: result.tokens } });
});
```

---

## 4. Adapter CrewAI

Squads Lumi mapeiam 1:1 com o conceito de `Crew` do CrewAI:

```python
# crewai_adapter.py
from crewai import Agent, Crew, Task
import httpx

LUMI_API_URL = "http://localhost:3001"
LUMI_API_KEY = "lumi_xxxx"

def import_squad_as_crew(squad_id: str) -> Crew:
    """Importa um Squad Lumi como um Crew do CrewAI."""
    response = httpx.get(
        f"{LUMI_API_URL}/v1/squads/{squad_id}/export?format=crewai",
        headers={"Authorization": f"Bearer {LUMI_API_KEY}"}
    )
    squad_data = response.json()

    agents = [
        Agent(
            role=a["name"],
            goal=a["mission"],
            backstory=a["personality"],
            llm=a["primary_model"]
        )
        for a in squad_data["agents"]
    ]

    return Crew(agents=agents, verbose=True)

# Exportar um Crew do CrewAI como Squad no Lumi
def export_crew_to_lumi(crew: Crew, squad_name: str) -> str:
    payload = {
        "name": squad_name,
        "agents": [
            {
                "name": a.role,
                "mission": a.goal,
                "personality": a.backstory,
                "primary_model": str(a.llm)
            }
            for a in crew.agents
        ]
    }
    response = httpx.post(
        f"{LUMI_API_URL}/v1/squads/import",
        json=payload,
        headers={"Authorization": f"Bearer {LUMI_API_KEY}"}
    )
    return response.json()["squad_id"]
```

### Endpoints de export/import

```typescript
// GET /v1/squads/:id/export?format=crewai|autogen|langchain
// POST /v1/squads/import
```

---

## 5. Adapter AutoGen (Microsoft)

Compatibilidade com o protocolo `ConversableAgent` do AutoGen:

```python
# autogen_adapter.py
from autogen import ConversableAgent
import httpx

class LumiAutoGenAgent(ConversableAgent):
    """Wrapper que faz um agente Lumi aparecer como ConversableAgent do AutoGen."""

    def __init__(self, agent_name: str, lumi_api_key: str, lumi_url: str):
        super().__init__(name=agent_name, human_input_mode="NEVER")
        self.lumi_api_key = lumi_api_key
        self.lumi_url = lumi_url
        self.agent_name = agent_name

    def generate_reply(self, messages=None, sender=None, **kwargs):
        """Intercepta a geração de resposta e delega para o Lumi."""
        last_message = messages[-1]["content"] if messages else ""
        response = httpx.post(
            f"{self.lumi_url}/v1/agents/{self.agent_name}/invoke",
            json={"message": last_message},
            headers={"Authorization": f"Bearer {self.lumi_api_key}"},
            timeout=60
        )
        return response.json()["response"]

# Uso em uma conversa AutoGen
sofia = LumiAutoGenAgent("sofia", lumi_api_key="lumi_xxx", lumi_url="http://localhost:3001")
user_proxy = ConversableAgent("user", human_input_mode="TERMINATE")
user_proxy.initiate_chat(sofia, message="Preciso de ajuda com meu pedido")
```

---

## 6. OpenAPI Spec Público

O Lumi Plus disponibiliza um OpenAPI 3.1 completo para que qualquer framework consuma agentes como ferramentas:

```yaml
# openapi.yaml (disponível em GET /openapi.json)
openapi: "3.1.0"
info:
  title: Lumi Plus API
  version: "1.0"
  description: Plataforma de orquestração de agentes de IA

paths:
  /v1/agents/{name}/invoke:
    post:
      summary: Invocar agente por nome
      parameters:
        - name: name
          in: path
          required: true
          schema: { type: string }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                message: { type: string }
                context: { type: object }
              required: [message]
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  response: { type: string }
                  metadata:
                    type: object
                    properties:
                      tokens: { type: integer }
                      model: { type: string }
                      latency_ms: { type: integer }

  /v1/squads/{id}/trigger:
    post:
      summary: Disparar execução de squad
      # ... (ver doc 20)

  /v1/skills:
    get:
      summary: Listar skills disponíveis para o tenant
    post:
      summary: Registrar nova skill externa
```

---

## 7. Checklist de Implementação

```
Skills Externas:
[ ] Criar tabela tenant_skills no Prisma schema
[ ] Implementar SkillRegistryService (registrar, listar, executar com HMAC)
[ ] Adicionar skills externas ao tool calling do AIService
[ ] CLI: lumi skill add/list/test/remove
[ ] Documentar contrato skill + exemplo Python + Node.js

Adapter LangChain:
[ ] Endpoint POST /v1/agents/:name/invoke
[ ] Publicar pacote npm @lumiplus/langchain-adapter
[ ] Publicar pacote pip lumiplus-langchain

Adapter CrewAI:
[ ] Endpoint GET /v1/squads/:id/export?format=crewai
[ ] Endpoint POST /v1/squads/import
[ ] Publicar pacote pip lumiplus-crewai

Adapter AutoGen:
[ ] Publicar pacote pip lumiplus-autogen
[ ] Documentar LumiAutoGenAgent wrapper

OpenAPI:
[ ] Gerar openapi.json automaticamente a partir das rotas Fastify
[ ] Disponibilizar em GET /openapi.json e GET /docs (Swagger UI)
[ ] Manter sincronizado com cada novo endpoint
```

---

## 8. Exemplo de Compatibilidade Completa

```
Developer Flow:
1. Cria skill "consulta_estoque" em Python → registra com `lumi skill add`
2. Cria agente "Sofia" no dashboard → atribui skill consulta_estoque
3. Integra Sofia num pipeline LangChain existente via lumi_agent("sofia")
4. Exporta o Squad completo para CrewAI: import_squad_as_crew("squad-123")
5. Outro time usa AutoGen: LumiAutoGenAgent("sofia", ...)

Resultado: O mesmo agente Lumi funciona em 3 frameworks diferentes
           sem reescrever lógica.
```

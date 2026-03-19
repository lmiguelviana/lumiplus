-- Migração manual para habilitar Row Level Security (RLS)
-- Nota: Executar após as migrações iniciais do Prisma

-- Habilitar RLS em todas as tabelas sensíveis
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- Criar política de isolamento básico
-- O backend deve setar 'app.current_tenant' em cada request
CREATE POLICY tenant_isolation ON tenants USING (id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation ON agents USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation ON agent_skills USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation ON agent_api_keys USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation ON tenant_members USING (tenant_id = current_setting('app.current_tenant')::uuid);

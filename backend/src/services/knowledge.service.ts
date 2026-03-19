import { prisma } from '../lib/prisma.js';
import { EmbeddingService } from './embedding.service.js';
import { isPostgres as checkPostgres } from '../lib/database.js';
import { randomUUID } from 'crypto';


export interface KnowledgeResult {
  content: string;
  similarity: number;
}

/**
 * Serviço de Gerenciamento de Conhecimento (RAG).
 * @database-architect principle: Smart DB detection for Vector Search.
 */
export class KnowledgeService {
  
  static async search(
    tenantId: string, 
    agentId: string, 
    query: string, 
    limit: number = 3
  ): Promise<KnowledgeResult[]> {
    
    const isPostgres = checkPostgres();
    
    if (!isPostgres) {
      console.warn('⚠️ Busca Vetorial desativada: SQLite não suporta pgvector nativamente.');
      return [];
    }

    // Busca vetorial via SQL RAW (Supabase/Postgres)
    try {
      const queryVector = await EmbeddingService.generate(tenantId, query);
      const vectorString = `[${queryVector.join(',')}]`;

      const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT 
          content, 
          1 - (embedding <=> $1::vector) AS similarity
        FROM agent_knowledge
        WHERE 
          tenant_id = $2::text AND 
          agent_id = $3::text
        ORDER BY similarity DESC
        LIMIT $4
      `, vectorString, tenantId, agentId, limit);

      return results.map((r: any) => ({
        content: r.content,
        similarity: Number(r.similarity)
      }));
    } catch (error) {
      console.warn('⚠️ KnowledgeService Search Error (Probably missing table):', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Adiciona conteúdo à base de conhecimento com chunking automático.
   */
  static async add(tenantId: string, agentId: string, content: string, title?: string) {
    const isPostgres = checkPostgres();
    
    // Configuração de chunking
    const CHUNK_SIZE = 1000;
    const CHUNK_OVERLAP = 100;
    
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(content.slice(i, i + CHUNK_SIZE));
    }

    console.log(`🧠 Processando ${chunks.length} fragmentos de conhecimento para Agente ${agentId}`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      if (!isPostgres) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO agent_knowledge (id, tenant_id, agent_id, content, title, chunk_index)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, randomUUID(), tenantId, agentId, chunk, title || 'Documento', i);
        continue;
      }

      const embedding = await EmbeddingService.generate(tenantId, chunk);
      const vectorString = `[${embedding.join(',')}]`;

      try {
        const now = new Date();
        await prisma.$executeRawUnsafe(`
          INSERT INTO agent_knowledge (id, tenant_id, agent_id, content, title, chunk_index, embedding, updated_at)
          VALUES ($1::text, $2::text, $3::text, $4, $5, $6, $7::vector, $8)
        `, randomUUID(), tenantId, agentId, chunk, title || 'Documento', i, vectorString, now);
      } catch (insertError: any) {
        console.error('❌ [KNOWLEDGE] Erro ao inserir fragmento no banco:', insertError.message);
        throw new Error(`Falha na persistência do conhecimento: ${insertError.message}`);
      }
    }
  }

  static async delete(id: string, tenantId: string) {
    if (checkPostgres()) {
      return prisma.$executeRawUnsafe(`
        DELETE FROM agent_knowledge WHERE id = $1::text AND tenant_id = $2::text
      `, id, tenantId);
    }
    return prisma.$executeRawUnsafe(`
      DELETE FROM agent_knowledge WHERE id = $1 AND tenant_id = $2
    `, id, tenantId);
  }

  static async update(id: string, tenantId: string, content: string, title?: string) {
    const isPostgres = checkPostgres();
    const now = new Date();

    if (!isPostgres) {
      return prisma.$executeRawUnsafe(`
        UPDATE agent_knowledge 
        SET content = $1, title = $2, updated_at = $3
        WHERE id = $4 AND tenant_id = $5
      `, content, title || 'Documento', now, id, tenantId);
    }

    const embedding = await EmbeddingService.generate(tenantId, content);
    const vectorString = `[${embedding.join(',')}]`;

    return prisma.$executeRawUnsafe(`
      UPDATE agent_knowledge 
      SET content = $1, title = $2, embedding = $3::vector, updated_at = $4
      WHERE id = $5::text AND tenant_id = $6::text
    `, content, title || 'Documento', vectorString, now, id, tenantId);
  }

  /**
   * Salva um item na base de conhecimento (atalho para add com objeto).
   */
  static async save(tenantId: string, agentId: string, item: { title: string; content: string }) {
    return this.add(tenantId, agentId, item.content, item.title);
  }

  /**
   * Retorna o conteúdo do SOUL.md do agente (null se não existir).
   */
  static async getSoul(tenantId: string, agentId: string): Promise<string | null> {
    const isPostgres = checkPostgres();
    const results = isPostgres
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT content FROM agent_knowledge WHERE tenant_id = $1::text AND agent_id = $2::text AND title = 'SOUL' ORDER BY created_at DESC LIMIT 1`,
          tenantId, agentId
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT content FROM agent_knowledge WHERE tenant_id = $1 AND agent_id = $2 AND title = 'SOUL' ORDER BY created_at DESC LIMIT 1`,
          tenantId, agentId
        );
    return results[0]?.content ?? null;
  }

  /**
   * Substitui o SOUL.md do agente (apaga anterior e salva novo).
   */
  static async setSoul(tenantId: string, agentId: string, content: string): Promise<void> {
    const isPostgres = checkPostgres();
    if (isPostgres) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM agent_knowledge WHERE tenant_id = $1::text AND agent_id = $2::text AND title = 'SOUL'`,
        tenantId, agentId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM agent_knowledge WHERE tenant_id = $1 AND agent_id = $2 AND title = 'SOUL'`,
        tenantId, agentId
      );
    }
    await this.add(tenantId, agentId, content, 'SOUL');
  }

  static async listByAgent(agentId: string, tenantId: string) {
    const isPostgres = checkPostgres();
    if (!isPostgres) {
      return prisma.$queryRawUnsafe(`
        SELECT id, title, content, chunk_index, created_at 
        FROM agent_knowledge 
        WHERE agent_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
      `, agentId, tenantId);
    }

    return prisma.$queryRawUnsafe(`
      SELECT id, title, content, chunk_index, created_at 
      FROM agent_knowledge 
      WHERE agent_id = $1::text AND tenant_id = $2::text
      ORDER BY created_at DESC
    `, agentId, tenantId);
  }
}

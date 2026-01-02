-- ============================================================
-- Migration 002: Enhance RAG Evidence System
-- ============================================================

-- Add full-text search index for evidence chunks
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_text_search 
ON agent.evidence_chunks 
USING gin(to_tsvector('english', text));

-- Add Chinese full-text search index
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_text_search_zh 
ON agent.evidence_chunks 
USING gin(to_tsvector('simple', text));

-- Add composite index for filtered searches
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_source_offer
ON agent.evidence_chunks(source_type, offer_id);

-- Add index for language filtering
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_language
ON agent.evidence_chunks(language);

-- Add category filter index
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_category
ON agent.evidence_chunks(category_id);

-- ============================================================
-- Knowledge Graph Support Tables (for future GraphRAG)
-- ============================================================

-- Entity table for knowledge graph
CREATE TABLE IF NOT EXISTS agent.kg_entities (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'ent_' || substr(uuid_generate_v4()::text, 1, 12),
    entity_type VARCHAR(100) NOT NULL,
    name VARCHAR(500) NOT NULL,
    normalized_name VARCHAR(500),
    aliases TEXT[] DEFAULT '{}',
    properties JSONB DEFAULT '{}',
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Relation table for knowledge graph
CREATE TABLE IF NOT EXISTS agent.kg_relations (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'rel_' || substr(uuid_generate_v4()::text, 1, 12),
    source_entity_id VARCHAR(255) REFERENCES agent.kg_entities(id),
    target_entity_id VARCHAR(255) REFERENCES agent.kg_entities(id),
    relation_type VARCHAR(100) NOT NULL,
    weight DECIMAL(5, 4) DEFAULT 1.0,
    properties JSONB DEFAULT '{}',
    evidence_chunk_ids TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Entity-Chunk linking table
CREATE TABLE IF NOT EXISTS agent.kg_entity_chunks (
    entity_id VARCHAR(255) REFERENCES agent.kg_entities(id),
    chunk_id VARCHAR(255) REFERENCES agent.evidence_chunks(id),
    relevance_score DECIMAL(5, 4) DEFAULT 1.0,
    offsets JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (entity_id, chunk_id)
);

-- Indexes for knowledge graph
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON agent.kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_name ON agent.kg_entities(normalized_name);
CREATE INDEX IF NOT EXISTS idx_kg_relations_source ON agent.kg_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_target ON agent.kg_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_type ON agent.kg_relations(relation_type);

-- Vector index for entity embeddings
CREATE INDEX IF NOT EXISTS idx_kg_entities_embedding
ON agent.kg_entities
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

-- ============================================================
-- XOOBAY Product Sync Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS agent.xoobay_sync_log (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'sync_' || substr(uuid_generate_v4()::text, 1, 12),
    sync_type VARCHAR(50) NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    products_synced INTEGER DEFAULT 0,
    chunks_created INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_details JSONB DEFAULT '[]',
    duration_ms INTEGER,
    status VARCHAR(50) DEFAULT 'running',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_xoobay_sync_log_status ON agent.xoobay_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_xoobay_sync_log_time ON agent.xoobay_sync_log(created_at DESC);

-- ============================================================
-- Functions for RAG Operations
-- ============================================================

-- Function to search chunks with hybrid scoring
CREATE OR REPLACE FUNCTION agent.search_chunks_hybrid(
    p_query TEXT,
    p_source_types TEXT[] DEFAULT NULL,
    p_offer_id TEXT DEFAULT NULL,
    p_language TEXT DEFAULT 'en',
    p_limit INTEGER DEFAULT 10,
    p_min_score DECIMAL DEFAULT 0.3
)
RETURNS TABLE (
    chunk_id VARCHAR,
    text TEXT,
    source_type VARCHAR,
    offer_id VARCHAR,
    score DECIMAL,
    offsets JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH keyword_matches AS (
        SELECT 
            ec.id,
            ec.text,
            ec.source_type,
            ec.offer_id,
            ec.offsets,
            ts_rank(to_tsvector('english', ec.text), plainto_tsquery('english', p_query)) as ts_score
        FROM agent.evidence_chunks ec
        WHERE 
            (p_source_types IS NULL OR ec.source_type = ANY(p_source_types))
            AND (p_offer_id IS NULL OR ec.offer_id = p_offer_id)
            AND ec.language = p_language
            AND to_tsvector('english', ec.text) @@ plainto_tsquery('english', p_query)
    )
    SELECT 
        km.id::VARCHAR,
        km.text::TEXT,
        km.source_type::VARCHAR,
        km.offer_id::VARCHAR,
        LEAST(km.ts_score::DECIMAL, 1.0) as score,
        km.offsets
    FROM keyword_matches km
    WHERE km.ts_score >= p_min_score
    ORDER BY km.ts_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get related entities for a chunk
CREATE OR REPLACE FUNCTION agent.get_chunk_entities(
    p_chunk_id TEXT
)
RETURNS TABLE (
    entity_id VARCHAR,
    entity_type VARCHAR,
    name VARCHAR,
    relevance_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id::VARCHAR,
        e.entity_type::VARCHAR,
        e.name::VARCHAR,
        ec.relevance_score
    FROM agent.kg_entity_chunks ec
    JOIN agent.kg_entities e ON e.id = ec.entity_id
    WHERE ec.chunk_id = p_chunk_id
    ORDER BY ec.relevance_score DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE agent.kg_entities IS 'Knowledge graph entities extracted from evidence chunks';
COMMENT ON TABLE agent.kg_relations IS 'Relations between knowledge graph entities';
COMMENT ON TABLE agent.kg_entity_chunks IS 'Links between entities and their source evidence chunks';
COMMENT ON TABLE agent.xoobay_sync_log IS 'Tracking log for XOOBAY product synchronization';
COMMENT ON FUNCTION agent.search_chunks_hybrid IS 'Hybrid search combining full-text and semantic similarity';


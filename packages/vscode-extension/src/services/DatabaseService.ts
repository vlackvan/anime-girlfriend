import { Pool, PoolClient, QueryResult } from 'pg';
import * as vscode from 'vscode';

export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

export class DatabaseService {
    private static instance: DatabaseService;
    private pool: Pool | null = null;
    private isInitialized = false;

    private constructor() {}

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    /**
     * Initialize database connection and schema
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized && this.pool) {
            return;
        }

        try {
            const config = this.getConfig();

            this.pool = new Pool({
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.user,
                password: config.password,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });

            // Test connection
            const client = await this.pool.connect();
            try {
                await client.query('SELECT NOW()');
                console.log('[DatabaseService] Connected to PostgreSQL');
            } finally {
                client.release();
            }

            // Initialize schema
            await this.initializeSchema();

            this.isInitialized = true;
            console.log('[DatabaseService] Initialization complete');
        } catch (error) {
            console.error('[DatabaseService] Failed to initialize:', error);
            throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create database schema with pgvector extension and tables
     */
    private async initializeSchema(): Promise<void> {
        const client = await this.getClient();

        try {
            // Enable pgvector extension
            await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
            console.log('[DatabaseService] pgvector extension enabled');

            // Create documents table
            await client.query(`
                CREATE TABLE IF NOT EXISTS documents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    content TEXT NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('[DatabaseService] Documents table created');

            // Create embeddings table with vector column (384 dimensions for all-MiniLM-L6-v2)
            await client.query(`
                CREATE TABLE IF NOT EXISTS embeddings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    embedding vector(384) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('[DatabaseService] Embeddings table created');

            // Create HNSW index for fast similarity search
            await client.query(`
                CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
                ON embeddings
                USING hnsw (embedding vector_cosine_ops);
            `);
            console.log('[DatabaseService] HNSW index created');

            // Create index on document_id for faster joins
            await client.query(`
                CREATE INDEX IF NOT EXISTS embeddings_document_id_idx
                ON embeddings(document_id);
            `);
            console.log('[DatabaseService] Document ID index created');

        } catch (error) {
            console.error('[DatabaseService] Schema initialization failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get database configuration from VS Code settings
     */
    private getConfig(): DatabaseConfig {
        const config = vscode.workspace.getConfiguration('anime-girlfriend');

        return {
            host: config.get<string>('database.host', 'localhost'),
            port: config.get<number>('database.port', 5432),
            database: config.get<string>('database.name', 'anime_girlfriend_rag'),
            user: config.get<string>('database.user', 'postgres'),
            password: config.get<string>('database.password', 'postgres'),
        };
    }

    /**
     * Get a database client from the pool
     */
    public async getClient(): Promise<PoolClient> {
        if (!this.pool) {
            await this.initialize();
        }

        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        return this.pool.connect();
    }

    /**
     * Execute a query with parameters
     */
    public async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
        if (!this.pool) {
            await this.initialize();
        }

        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            return await this.pool.query<T>(text, params);
        } catch (error) {
            console.error('[DatabaseService] Query failed:', error);
            throw error;
        }
    }

    /**
     * Insert a document and return its ID
     */
    public async insertDocument(content: string, metadata: Record<string, any>): Promise<string> {
        const result = await this.query<{ id: string }>(
            'INSERT INTO documents (content, metadata) VALUES ($1, $2) RETURNING id',
            [content, JSON.stringify(metadata)]
        );

        return result.rows[0].id;
    }

    /**
     * Insert an embedding for a document
     */
    public async insertEmbedding(documentId: string, embedding: number[]): Promise<string> {
        // Convert array to PostgreSQL vector format
        const vectorString = `[${embedding.join(',')}]`;

        const result = await this.query<{ id: string }>(
            'INSERT INTO embeddings (document_id, embedding) VALUES ($1, $2::vector) RETURNING id',
            [documentId, vectorString]
        );

        return result.rows[0].id;
    }

    /**
     * Perform similarity search using cosine distance
     */
    public async similaritySearch(
        queryEmbedding: number[],
        limit: number = 5,
        minSimilarity: number = 0.5
    ): Promise<Array<{ id: string; content: string; metadata: any; similarity: number }>> {
        const vectorString = `[${queryEmbedding.join(',')}]`;

        const result = await this.query<{
            id: string;
            content: string;
            metadata: any;
            similarity: number;
        }>(
            `
            SELECT
                d.id,
                d.content,
                d.metadata,
                1 - (e.embedding <=> $1::vector) as similarity
            FROM embeddings e
            JOIN documents d ON e.document_id = d.id
            WHERE 1 - (e.embedding <=> $1::vector) >= $2
            ORDER BY e.embedding <=> $1::vector
            LIMIT $3
            `,
            [vectorString, minSimilarity, limit]
        );

        return result.rows;
    }

    /**
     * Get document count
     */
    public async getDocumentCount(): Promise<number> {
        const result = await this.query<{ count: string }>(
            'SELECT COUNT(*) as count FROM documents'
        );
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Clear all documents and embeddings
     */
    public async clearAll(): Promise<void> {
        await this.query('TRUNCATE TABLE embeddings, documents CASCADE');
        console.log('[DatabaseService] All data cleared');
    }

    /**
     * Close database connection
     */
    public async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isInitialized = false;
            console.log('[DatabaseService] Connection closed');
        }
    }

    /**
     * Check if RAG is enabled in settings
     */
    public isRagEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('anime-girlfriend');
        return config.get<boolean>('rag.enabled', true);
    }

    /**
     * Get max results from settings
     */
    public getMaxResults(): number {
        const config = vscode.workspace.getConfiguration('anime-girlfriend');
        return config.get<number>('rag.maxResults', 5);
    }

    /**
     * Search documents by metadata with similarity ordering
     * @param metadataFilter - Metadata key-value pairs to filter by
     * @param queryEmbedding - Optional embedding for similarity ordering
     * @param limit - Maximum number of results
     * @returns Array of matching documents
     */
    public async searchByMetadata(
        metadataFilter: Record<string, any>,
        queryEmbedding?: number[],
        limit: number = 5
    ): Promise<Array<{ id: string; content: string; metadata: any; similarity: number }>> {
        // Build WHERE clause for metadata filters
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(metadataFilter)) {
            conditions.push(`d.metadata->>'${key}' = $${paramIndex}`);
            params.push(value);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // If we have an embedding, calculate similarity; otherwise just return matches
        let query: string;
        if (queryEmbedding) {
            const vectorString = `[${queryEmbedding.join(',')}]`;
            params.unshift(vectorString); // Add as first parameter
            // Adjust param indices in WHERE clause
            const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, num) => `$${parseInt(num) + 1}`);

            // IMPORTANT: Do NOT use ORDER BY with metadata filters due to PostgreSQL/pgvector bug
            // When combining WHERE metadata filter + ORDER BY vector distance, the query returns 0 results
            // Instead, we calculate similarity and sort in memory (which is fine since metadata filters
            // typically return only 1-3 documents)
            query = `
                SELECT
                    d.id,
                    d.content,
                    d.metadata,
                    1 - (e.embedding <=> $1::vector) as similarity
                FROM embeddings e
                JOIN documents d ON e.document_id = d.id
                ${adjustedWhereClause}
            `;
        } else {
            query = `
                SELECT
                    d.id,
                    d.content,
                    d.metadata,
                    0 as similarity
                FROM documents d
                ${whereClause}
            `;
        }

        const result = await this.query<{
            id: string;
            content: string;
            metadata: any;
            similarity: number;
        }>(query, params);

        // Sort by similarity in memory and apply limit
        // This is efficient because metadata-filtered queries typically return very few documents
        let rows = result.rows;
        if (queryEmbedding && rows.length > 0) {
            rows.sort((a, b) => b.similarity - a.similarity);
        }

        return rows.slice(0, limit);
    }
}

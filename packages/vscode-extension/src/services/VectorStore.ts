import { DatabaseService } from './DatabaseService';
import { EmbeddingService } from './EmbeddingService';

export interface Document {
    content: string;
    metadata: Record<string, any>;
}

export interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, any>;
    similarity: number;
}

export class VectorStore {
    private static instance: VectorStore;
    private dbService: DatabaseService;
    private embeddingService: EmbeddingService;
    private isInitialized = false;

    private constructor() {
        this.dbService = DatabaseService.getInstance();
        this.embeddingService = EmbeddingService.getInstance();
    }

    public static getInstance(): VectorStore {
        if (!VectorStore.instance) {
            VectorStore.instance = new VectorStore();
        }
        return VectorStore.instance;
    }

    /**
     * Initialize the vector store (database + embedding model)
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('[VectorStore] Initializing...');

            // Initialize database first
            await this.dbService.initialize();

            // Initialize embedding model
            await this.embeddingService.initialize();

            this.isInitialized = true;
            console.log('[VectorStore] Initialization complete');
        } catch (error) {
            console.error('[VectorStore] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Add a single document to the vector store
     * @param document - The document to add
     * @returns The document ID
     */
    public async addDocument(document: Document): Promise<string> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Generate embedding for the document content
            const embedding = await this.embeddingService.generateEmbedding(document.content);

            // Insert document into database
            const documentId = await this.dbService.insertDocument(
                document.content,
                document.metadata
            );

            // Insert embedding
            await this.dbService.insertEmbedding(documentId, embedding);

            console.log('[VectorStore] Document added:', documentId);
            return documentId;
        } catch (error) {
            console.error('[VectorStore] Failed to add document:', error);
            throw error;
        }
    }

    /**
     * Add multiple documents to the vector store
     * @param documents - Array of documents to add
     * @returns Array of document IDs
     */
    public async addDocuments(documents: Document[]): Promise<string[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const documentIds: string[] = [];

        console.log(`[VectorStore] Adding ${documents.length} documents...`);

        for (const doc of documents) {
            try {
                const id = await this.addDocument(doc);
                documentIds.push(id);
            } catch (error) {
                console.error('[VectorStore] Failed to add document, continuing...', error);
            }
        }

        console.log(`[VectorStore] Successfully added ${documentIds.length}/${documents.length} documents`);
        return documentIds;
    }

    /**
     * Perform similarity search to find relevant documents
     * @param query - The search query
     * @param k - Number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity threshold (default: 0.5)
     * @returns Array of search results sorted by similarity
     */
    public async similaritySearch(
        query: string,
        k?: number,
        minSimilarity: number = 0.3
    ): Promise<SearchResult[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Use configured max results if k not provided
        const limit = k ?? this.dbService.getMaxResults();

        try {
            // Generate embedding for the query
            const queryEmbedding = await this.embeddingService.generateEmbedding(query);

            // Perform similarity search in database
            const results = await this.dbService.similaritySearch(
                queryEmbedding,
                limit,
                minSimilarity
            );

            console.log(`[VectorStore] Found ${results.length} similar documents for query: "${query.substring(0, 50)}..."`);

            return results;
        } catch (error) {
            console.error('[VectorStore] Similarity search failed:', error);
            return [];
        }
    }

    /**
     * Search for documents with specific metadata filters
     * @param query - The search query
     * @param metadataFilter - Metadata filters to apply
     * @param k - Number of results to return
     * @returns Filtered search results
     */
    public async searchWithFilters(
        query: string,
        metadataFilter: Record<string, any>,
        k?: number
    ): Promise<SearchResult[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // If we have a problemId filter, do a direct metadata search first
        // This is more reliable than similarity search for specific problem lookups
        if (metadataFilter.problemId) {
            try {
                const queryEmbedding = await this.embeddingService.generateEmbedding(query);
                const results = await this.dbService.searchByMetadata(metadataFilter, queryEmbedding, k ?? 5);

                if (results.length > 0) {
                    console.log(`[VectorStore] Found ${results.length} documents via metadata filter`);
                    return results;
                }
            } catch (error) {
                console.error('[VectorStore] Metadata search failed, falling back to similarity search:', error);
            }
        }

        // Fallback to similarity search with filtering
        const results = await this.similaritySearch(query, k, 0.0); // Use 0.0 threshold for filtered searches

        // Filter results based on metadata
        return results.filter(result => {
            return Object.entries(metadataFilter).every(([key, value]) => {
                return result.metadata[key] === value;
            });
        });
    }

    /**
     * Get document count in the store
     */
    public async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return this.dbService.getDocumentCount();
    }

    /**
     * Clear all documents from the store
     */
    public async clearAll(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        await this.dbService.clearAll();
        console.log('[VectorStore] All documents cleared');
    }

    /**
     * Check if RAG is enabled
     */
    public isEnabled(): boolean {
        return this.dbService.isRagEnabled();
    }

    /**
     * Close the vector store and cleanup resources
     */
    public async close(): Promise<void> {
        await this.dbService.close();
        await this.embeddingService.dispose();
        this.isInitialized = false;
        console.log('[VectorStore] Closed');
    }
}

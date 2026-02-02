import { VectorStore, SearchResult } from './VectorStore';

export interface RetrievedContext {
    documents: SearchResult[];
    formattedContext: string;
}

export class RAGService {
    private static instance: RAGService;
    private vectorStore: VectorStore;

    private constructor() {
        this.vectorStore = VectorStore.getInstance();
    }

    public static getInstance(): RAGService {
        if (!RAGService.instance) {
            RAGService.instance = new RAGService();
        }
        return RAGService.instance;
    }

    /**
     * Initialize the RAG service
     */
    public async initialize(): Promise<void> {
        try {
            await this.vectorStore.initialize();
            console.log('[RAGService] Initialized successfully');
        } catch (error) {
            console.error('[RAGService] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Retrieve relevant context for a query
     * @param query - The user's message/query
     * @param maxResults - Maximum number of results to retrieve
     * @returns Retrieved context with formatted string
     */
    public async retrieveContext(query: string, maxResults?: number): Promise<RetrievedContext> {
        try {
            // Check if RAG is enabled
            if (!this.vectorStore.isEnabled()) {
                console.log('[RAGService] RAG is disabled, returning empty context');
                return {
                    documents: [],
                    formattedContext: '',
                };
            }

            // Perform similarity search
            const documents = await this.vectorStore.similaritySearch(query, maxResults);

            // Format the context for the LLM
            const formattedContext = this.formatContext(documents);

            console.log(`[RAGService] Retrieved ${documents.length} relevant documents`);

            return {
                documents,
                formattedContext,
            };
        } catch (error) {
            console.error('[RAGService] Failed to retrieve context:', error);
            return {
                documents: [],
                formattedContext: '',
            };
        }
    }

    /**
     * Retrieve context specifically for BOJ problems
     * @param problemId - The BOJ problem ID
     * @returns Retrieved context
     */
    public async retrieveBOJContext(problemId: string): Promise<RetrievedContext> {
        try {
            if (!this.vectorStore.isEnabled()) {
                return {
                    documents: [],
                    formattedContext: '',
                };
            }

            // Search for documents related to this problem
            const documents = await this.vectorStore.searchWithFilters(
                `Baekjoon problem ${problemId}`,
                { problemId },
                3 // Limit to 3 results for BOJ-specific queries
            );

            const formattedContext = this.formatBOJContext(documents, problemId);

            console.log(`[RAGService] Retrieved ${documents.length} documents for BOJ problem ${problemId}`);

            return {
                documents,
                formattedContext,
            };
        } catch (error) {
            console.error('[RAGService] Failed to retrieve BOJ context:', error);
            return {
                documents: [],
                formattedContext: '',
            };
        }
    }

    /**
     * Format retrieved documents into a context string for the LLM
     * @param documents - Retrieved documents
     * @returns Formatted context string
     */
    private formatContext(documents: SearchResult[]): string {
        if (documents.length === 0) {
            return '';
        }

        const parts: string[] = [
            '## Retrieved Context from Past Solutions and Conversations:',
            '',
        ];

        documents.forEach((doc, index) => {
            parts.push(`### Context ${index + 1} (Relevance: ${(doc.similarity * 100).toFixed(1)}%)`);

            // Add metadata if available
            if (doc.metadata.problemId) {
                parts.push(`**Problem ID:** ${doc.metadata.problemId}`);
            }
            if (doc.metadata.language) {
                parts.push(`**Language:** ${doc.metadata.language}`);
            }
            if (doc.metadata.fileName) {
                parts.push(`**File:** ${doc.metadata.fileName}`);
            }

            parts.push('');
            parts.push(doc.content);
            parts.push('');
            parts.push('---');
            parts.push('');
        });

        return parts.join('\n');
    }

    /**
     * Format BOJ-specific context
     * @param documents - Retrieved documents
     * @param problemId - The problem ID
     * @returns Formatted context string
     */
    private formatBOJContext(documents: SearchResult[], problemId: string): string {
        if (documents.length === 0) {
            return '';
        }

        const parts: string[] = [
            `## Your Previous Solutions for BOJ Problem ${problemId}:`,
            '',
            `I found ${documents.length} previous solution(s) you worked on for this problem:`,
            '',
        ];

        documents.forEach((doc, index) => {
            parts.push(`### Solution ${index + 1}`);

            if (doc.metadata.language) {
                parts.push(`**Language:** ${doc.metadata.language}`);
            }
            if (doc.metadata.lastModified) {
                const date = new Date(doc.metadata.lastModified);
                parts.push(`**Last Modified:** ${date.toLocaleDateString()}`);
            }

            parts.push('');
            parts.push(doc.content);
            parts.push('');
            parts.push('---');
            parts.push('');
        });

        return parts.join('\n');
    }

    /**
     * Add chat message to the vector store for future retrieval
     * @param userMessage - The user's message
     * @param botResponse - The bot's response
     */
    public async addChatToMemory(userMessage: string, botResponse: string): Promise<void> {
        try {
            if (!this.vectorStore.isEnabled()) {
                return;
            }

            const content = `User: ${userMessage}\n\nAssistant: ${botResponse}`;

            await this.vectorStore.addDocument({
                content,
                metadata: {
                    type: 'conversation',
                    timestamp: new Date().toISOString(),
                    userMessage,
                    botResponse,
                },
            });

            console.log('[RAGService] Chat added to memory');
        } catch (error) {
            console.error('[RAGService] Failed to add chat to memory:', error);
        }
    }

    /**
     * Get statistics about the vector store
     */
    public async getStats(): Promise<{ documentCount: number; isEnabled: boolean }> {
        try {
            const documentCount = await this.vectorStore.getDocumentCount();
            const isEnabled = this.vectorStore.isEnabled();

            return {
                documentCount,
                isEnabled,
            };
        } catch (error) {
            console.error('[RAGService] Failed to get stats:', error);
            return {
                documentCount: 0,
                isEnabled: false,
            };
        }
    }

    /**
     * Clear all stored context
     */
    public async clearMemory(): Promise<void> {
        try {
            await this.vectorStore.clearAll();
            console.log('[RAGService] Memory cleared');
        } catch (error) {
            console.error('[RAGService] Failed to clear memory:', error);
            throw error;
        }
    }

    /**
     * Check if RAG is enabled
     */
    public isEnabled(): boolean {
        return this.vectorStore.isEnabled();
    }
}

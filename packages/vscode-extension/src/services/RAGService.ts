import { VectorStore, SearchResult } from './VectorStore';
import * as fs from 'fs';
import * as path from 'path';

export interface RetrievedContext {
    documents: SearchResult[];
    formattedContext: string;
}

export interface LocalBOJProblem {
    problemId: number;
    titleKo: string;
    difficulty: number;
    difficultyName: string;
    tags: string[];
    recommendedApproach: string;
}

export class RAGService {
    private static instance: RAGService;
    private vectorStore: VectorStore;
    private extensionPath?: string;
    private localBOJDataCache?: Map<number, LocalBOJProblem>;

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

        // Separate documents by type
        const tagDocs = documents.filter(d => d.metadata.type === 'boj_tag');
        const solutionDocs = documents.filter(d => d.metadata.type === 'solution');
        const conversationDocs = documents.filter(d => d.metadata.type === 'conversation');

        const parts: string[] = [];

        // Format BOJ tag documents (problem metadata and approaches)
        if (tagDocs.length > 0) {
            parts.push('## Relevant BOJ Problems (From solved.ac):');
            parts.push('');

            tagDocs.forEach((doc, index) => {
                parts.push(`### Problem ${index + 1}: ${doc.metadata.title || `Problem ${doc.metadata.problemId}`}`);
                parts.push(`**Problem ID:** ${doc.metadata.problemId}`);

                if (doc.metadata.difficultyName) {
                    parts.push(`**Difficulty:** ${doc.metadata.difficultyName}`);
                }

                if (doc.metadata.tags && Array.isArray(doc.metadata.tags)) {
                    parts.push(`**Tags:** ${doc.metadata.tags.join(', ')}`);
                }

                if (doc.metadata.recommendedApproach) {
                    parts.push('');
                    parts.push(`**Recommended Approach:**`);
                    parts.push(doc.metadata.recommendedApproach);
                }

                parts.push('');
                parts.push('---');
                parts.push('');
            });
        }

        // Format solution documents (user's actual code)
        if (solutionDocs.length > 0) {
            parts.push('## Your Past Solutions:');
            parts.push('');

            solutionDocs.forEach((doc, index) => {
                parts.push(`### Solution ${index + 1}`);

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
        }

        // Format conversation documents
        if (conversationDocs.length > 0) {
            parts.push('## Relevant Past Conversations:');
            parts.push('');

            conversationDocs.forEach((doc, index) => {
                parts.push(`### Conversation ${index + 1}`);
                parts.push('');
                parts.push(doc.content);
                parts.push('');
                parts.push('---');
                parts.push('');
            });
        }

        return parts.join('\n');
    }

    /**
     * Format BOJ-specific context
     * @param documents - Retrieved documents
     * @param problemId - The problem ID
     * @returns Formatted context string
     */
    private formatBOJContext(documents: SearchResult[], problemId: string): string {
        // Separate by type
        const tagDocs = documents.filter(d => d.metadata.type === 'boj_tag');
        const solutionDocs = documents.filter(d => d.metadata.type === 'solution');

        const parts: string[] = [];

        // Format problem metadata and approach (if available)
        if (tagDocs.length > 0) {
            const tagDoc = tagDocs[0]; // Use the first (most relevant) tag document

            parts.push(`## BOJ Problem ${problemId}: ${tagDoc.metadata.title || 'Problem Info'}`);
            parts.push('');

            if (tagDoc.metadata.difficultyName) {
                parts.push(`**Difficulty:** ${tagDoc.metadata.difficultyName} (Level ${tagDoc.metadata.difficulty})`);
            }

            if (tagDoc.metadata.tags && Array.isArray(tagDoc.metadata.tags)) {
                parts.push(`**Algorithm Tags:** ${tagDoc.metadata.tags.join(', ')}`);
            }

            parts.push('');
            parts.push('**Recommended Approach:**');
            parts.push(tagDoc.metadata.recommendedApproach || 'Analyze the problem carefully and choose appropriate algorithms.');
            parts.push('');
            parts.push('---');
            parts.push('');
        }

        // Format user's actual solutions (if they exist)
        if (solutionDocs.length > 0) {
            parts.push(`## Your Previous Solutions for Problem ${problemId}:`);
            parts.push('');
            parts.push(`I found ${solutionDocs.length} solution(s) you worked on:`);
            parts.push('');

            solutionDocs.forEach((doc, index) => {
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
        } else if (tagDocs.length === 0) {
            // No tags or solutions found
            parts.push(`## BOJ Problem ${problemId}`);
            parts.push('');
            parts.push('No information found for this problem in the database.');
            parts.push('');
        }

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

    /**
     * Set extension path for accessing local BOJ data
     */
    public setExtensionPath(extensionPath: string): void {
        this.extensionPath = extensionPath;
        this.localBOJDataCache = undefined; // Clear cache when path changes
    }

    /**
     * Load local BOJ problem data from JSON file
     */
    private async loadLocalBOJData(): Promise<Map<number, LocalBOJProblem>> {
        if (this.localBOJDataCache) {
            return this.localBOJDataCache;
        }

        if (!this.extensionPath) {
            console.warn('[RAGService] Extension path not set, cannot load local BOJ data');
            return new Map();
        }

        try {
            const dataPath = path.join(this.extensionPath, 'data', 'boj-problem-tags.json');
            const fileContent = fs.readFileSync(dataPath, 'utf-8');
            const data = JSON.parse(fileContent);

            const cache = new Map<number, LocalBOJProblem>();
            if (data.problems && Array.isArray(data.problems)) {
                for (const problem of data.problems) {
                    cache.set(problem.problemId, {
                        problemId: problem.problemId,
                        titleKo: problem.titleKo || '',
                        difficulty: problem.difficulty || 0,
                        difficultyName: problem.difficultyName || 'Unknown',
                        tags: problem.tags || [],
                        recommendedApproach: problem.recommendedApproach || ''
                    });
                }
            }

            this.localBOJDataCache = cache;
            console.log(`[RAGService] Loaded ${cache.size} problems from local BOJ data`);
            return cache;
        } catch (error) {
            console.error('[RAGService] Failed to load local BOJ data:', error);
            return new Map();
        }
    }

    /**
     * Get local BOJ problem data by problem ID
     * @param problemId - BOJ problem ID
     * @returns Problem data or null if not found
     */
    public async getLocalBOJProblem(problemId: string): Promise<LocalBOJProblem | null> {
        try {
            const data = await this.loadLocalBOJData();
            const id = parseInt(problemId, 10);
            if (isNaN(id)) {
                return null;
            }
            return data.get(id) || null;
        } catch (error) {
            console.error('[RAGService] Failed to get local BOJ problem:', error);
            return null;
        }
    }
}

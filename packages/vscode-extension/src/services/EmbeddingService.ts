import { pipeline, Pipeline } from '@xenova/transformers';

export class EmbeddingService {
    private static instance: EmbeddingService;
    private pipeline: Pipeline | null = null;
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    // Model configuration
    private readonly MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
    private readonly EMBEDDING_DIMENSION = 384;

    private constructor() {}

    public static getInstance(): EmbeddingService {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }

    /**
     * Initialize the embedding model
     * This loads the model weights from Hugging Face (cached locally after first load)
     */
    public async initialize(): Promise<void> {
        // If already initialized, return immediately
        if (this.isInitialized && this.pipeline) {
            return;
        }

        // If initialization is in progress, wait for it
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        // Start initialization
        this.initializationPromise = this._initialize();
        await this.initializationPromise;
        this.initializationPromise = null;
    }

    private async _initialize(): Promise<void> {
        try {
            console.log('[EmbeddingService] Loading embedding model:', this.MODEL_NAME);
            console.log('[EmbeddingService] This may take a while on first run (downloading model)...');

            // Load the feature extraction pipeline
            this.pipeline = await pipeline('feature-extraction', this.MODEL_NAME, {
                quantized: true, // Use quantized model for better performance
            });

            this.isInitialized = true;
            console.log('[EmbeddingService] Model loaded successfully');
        } catch (error) {
            console.error('[EmbeddingService] Failed to load model:', error);
            this.isInitialized = false;
            throw new Error(`Embedding model initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate embedding vector for a text string
     * @param text - The text to embed
     * @returns A 384-dimensional vector representing the text
     */
    public async generateEmbedding(text: string): Promise<number[]> {
        if (!this.isInitialized || !this.pipeline) {
            await this.initialize();
        }

        if (!this.pipeline) {
            throw new Error('Embedding pipeline not initialized');
        }

        try {
            // Truncate very long texts to avoid memory issues
            const maxLength = 512;
            const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

            // Generate embedding
            const output = await this.pipeline(truncatedText, {
                pooling: 'mean',
                normalize: true,
            });

            // Extract the embedding array
            let embedding: number[];

            if (Array.isArray(output)) {
                embedding = output;
            } else if (output.data) {
                embedding = Array.from(output.data);
            } else {
                throw new Error('Unexpected output format from embedding pipeline');
            }

            // Validate embedding dimension
            if (embedding.length !== this.EMBEDDING_DIMENSION) {
                console.warn(
                    `[EmbeddingService] Expected ${this.EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`
                );
            }

            return embedding;
        } catch (error) {
            console.error('[EmbeddingService] Failed to generate embedding:', error);
            throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate embeddings for multiple texts in batch
     * @param texts - Array of texts to embed
     * @returns Array of embedding vectors
     */
    public async generateEmbeddings(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];

        for (const text of texts) {
            try {
                const embedding = await this.generateEmbedding(text);
                embeddings.push(embedding);
            } catch (error) {
                console.error('[EmbeddingService] Failed to embed text:', text.substring(0, 100), error);
                // Push a zero vector on error to maintain array alignment
                embeddings.push(new Array(this.EMBEDDING_DIMENSION).fill(0));
            }
        }

        return embeddings;
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param a - First vector
     * @param b - Second vector
     * @returns Similarity score between -1 and 1
     */
    public cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Get the embedding dimension
     */
    public getDimension(): number {
        return this.EMBEDDING_DIMENSION;
    }

    /**
     * Get the model name
     */
    public getModelName(): string {
        return this.MODEL_NAME;
    }

    /**
     * Check if the service is initialized
     */
    public isReady(): boolean {
        return this.isInitialized && this.pipeline !== null;
    }

    /**
     * Dispose of the model and free resources
     */
    public async dispose(): Promise<void> {
        if (this.pipeline) {
            // The pipeline doesn't have a dispose method, so just clear the reference
            this.pipeline = null;
            this.isInitialized = false;
            console.log('[EmbeddingService] Disposed');
        }
    }
}

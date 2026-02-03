import * as vscode from 'vscode';
import * as path from 'path';
import { glob } from 'glob';
import { promises as fs } from 'fs';
import { VectorStore, Document } from './VectorStore';
import { SolvedAcTagFetcher, ProblemMetadata } from './SolvedAcTagFetcher';

interface BOJTagsData {
    version: string;
    generatedAt: string;
    problemCount: number;
    problems: ProblemMetadata[];
}

export interface FileMetadata {
    filePath: string;
    fileName: string;
    extension: string;
    problemId?: string;
    language?: string;
    lastModified?: Date;
    size?: number;
}

export class IngestionService {
    private static instance: IngestionService;
    private vectorStore: VectorStore;

    // Supported file extensions for BOJ solutions
    private readonly SUPPORTED_EXTENSIONS = ['.cpp', '.c', '.java', '.py', '.js', '.ts', '.go', '.rs'];

    // BOJ problem ID patterns
    private readonly BOJ_PATTERNS = [
        /boj[_-]?(\d+)/i,           // boj_1000, boj-1000
        /baekjoon[_-]?(\d+)/i,      // baekjoon_1000
        /백준[_-]?(\d+)/i,           // 백준_1000
        /problem[_-]?(\d+)/i,       // problem_1000
        /(\d{4,5})\.(?:cpp|c|java|py|js|ts|go|rs)$/i,  // 1000.cpp
    ];

    private constructor() {
        this.vectorStore = VectorStore.getInstance();
    }

    public static getInstance(): IngestionService {
        if (!IngestionService.instance) {
            IngestionService.instance = new IngestionService();
        }
        return IngestionService.instance;
    }

    /**
     * Scan workspace for BOJ solution files and ingest them
     * @param workspacePath - The workspace root path
     * @returns Number of files ingested
     */
    public async ingestWorkspace(workspacePath: string): Promise<number> {
        try {
            console.log('[IngestionService] Scanning workspace:', workspacePath);

            const files = await this.findSolutionFiles(workspacePath);
            console.log(`[IngestionService] Found ${files.length} potential solution files`);

            let ingestedCount = 0;

            for (const filePath of files) {
                try {
                    await this.ingestFile(filePath);
                    ingestedCount++;
                } catch (error) {
                    console.error(`[IngestionService] Failed to ingest file: ${filePath}`, error);
                }
            }

            console.log(`[IngestionService] Successfully ingested ${ingestedCount}/${files.length} files`);
            return ingestedCount;
        } catch (error) {
            console.error('[IngestionService] Workspace ingestion failed:', error);
            throw error;
        }
    }

    /**
     * Find all solution files in the workspace
     * @param workspacePath - The workspace root path
     * @returns Array of file paths
     */
    private async findSolutionFiles(workspacePath: string): Promise<string[]> {
        const patterns = this.SUPPORTED_EXTENSIONS.map(ext => `**/*${ext}`);
        const allFiles: string[] = [];

        for (const pattern of patterns) {
            try {
                const files = await glob(pattern, {
                    cwd: workspacePath,
                    absolute: true,
                    ignore: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/.git/**'],
                });
                allFiles.push(...files);
            } catch (error) {
                console.error(`[IngestionService] Failed to find files with pattern ${pattern}:`, error);
            }
        }

        return allFiles;
    }

    /**
     * Ingest a single file into the vector store
     * @param filePath - Path to the file
     */
    public async ingestFile(filePath: string): Promise<void> {
        try {
            // Read file content
            const content = await fs.readFile(filePath, 'utf-8');

            // Extract metadata
            const metadata = await this.extractMetadata(filePath, content);

            // Create documents (chunk if necessary)
            const documents = this.createDocuments(content, metadata);

            // Add to vector store
            await this.vectorStore.addDocuments(documents);

            console.log(`[IngestionService] Ingested: ${metadata.fileName} (Problem: ${metadata.problemId || 'unknown'})`);
        } catch (error) {
            console.error(`[IngestionService] Failed to ingest file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Extract metadata from file
     * @param filePath - Path to the file
     * @param content - File content
     * @returns File metadata
     */
    private async extractMetadata(filePath: string, content: string): Promise<FileMetadata> {
        const fileName = path.basename(filePath);
        const extension = path.extname(filePath);

        // Extract problem ID
        const problemId = this.extractProblemId(filePath);

        // Determine language
        const language = this.getLanguage(extension);

        // Get file stats
        let lastModified: Date | undefined;
        let size: number | undefined;

        try {
            const stats = await fs.stat(filePath);
            lastModified = stats.mtime;
            size = stats.size;
        } catch (error) {
            console.warn(`[IngestionService] Failed to get file stats for ${filePath}`);
        }

        return {
            filePath,
            fileName,
            extension,
            problemId,
            language,
            lastModified,
            size,
        };
    }

    /**
     * Extract BOJ problem ID from file path or content
     * @param filePath - Path to the file
     * @returns Problem ID or undefined
     */
    private extractProblemId(filePath: string): string | undefined {
        for (const pattern of this.BOJ_PATTERNS) {
            const match = filePath.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return undefined;
    }

    /**
     * Determine programming language from file extension
     * @param extension - File extension
     * @returns Language name
     */
    private getLanguage(extension: string): string {
        const languageMap: Record<string, string> = {
            '.cpp': 'C++',
            '.c': 'C',
            '.java': 'Java',
            '.py': 'Python',
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.go': 'Go',
            '.rs': 'Rust',
        };

        return languageMap[extension] || 'Unknown';
    }

    /**
     * Create documents from file content (with chunking if needed)
     * @param content - File content
     * @param metadata - File metadata
     * @returns Array of documents
     */
    private createDocuments(content: string, metadata: FileMetadata): Document[] {
        const maxChunkSize = 2000; // Characters per chunk
        const documents: Document[] = [];

        // If content is small enough, create a single document
        if (content.length <= maxChunkSize) {
            documents.push({
                content: this.createDocumentContent(content, metadata),
                metadata: {
                    ...metadata,
                    type: 'solution',
                    chunkIndex: 0,
                    totalChunks: 1,
                },
            });
            return documents;
        }

        // Split into chunks
        const chunks = this.chunkCode(content, maxChunkSize);

        for (let i = 0; i < chunks.length; i++) {
            documents.push({
                content: this.createDocumentContent(chunks[i], metadata),
                metadata: {
                    ...metadata,
                    type: 'solution',
                    chunkIndex: i,
                    totalChunks: chunks.length,
                },
            });
        }

        return documents;
    }

    /**
     * Create document content with context
     * @param code - Code content
     * @param metadata - File metadata
     * @returns Formatted document content
     */
    private createDocumentContent(code: string, metadata: FileMetadata): string {
        const parts: string[] = [];

        // Add metadata context
        if (metadata.problemId) {
            parts.push(`Baekjoon Problem ${metadata.problemId}`);
        }

        if (metadata.language) {
            parts.push(`Language: ${metadata.language}`);
        }

        parts.push(`File: ${metadata.fileName}`);

        // Add code
        parts.push('\nCode:\n```' + metadata.language?.toLowerCase() + '\n' + code + '\n```');

        return parts.join('\n');
    }

    /**
     * Chunk code into smaller pieces while preserving structure
     * @param code - Code to chunk
     * @param maxSize - Maximum chunk size
     * @returns Array of code chunks
     */
    private chunkCode(code: string, maxSize: number): string[] {
        const chunks: string[] = [];
        const lines = code.split('\n');

        let currentChunk: string[] = [];
        let currentSize = 0;

        for (const line of lines) {
            const lineSize = line.length + 1; // +1 for newline

            if (currentSize + lineSize > maxSize && currentChunk.length > 0) {
                // Save current chunk and start a new one
                chunks.push(currentChunk.join('\n'));
                currentChunk = [line];
                currentSize = lineSize;
            } else {
                currentChunk.push(line);
                currentSize += lineSize;
            }
        }

        // Add remaining chunk
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'));
        }

        return chunks;
    }

    /**
     * Ingest all workspaces
     */
    public async ingestAllWorkspaces(): Promise<number> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.warn('[IngestionService] No workspace folders found');
            return 0;
        }

        let totalIngested = 0;

        for (const folder of workspaceFolders) {
            try {
                const count = await this.ingestWorkspace(folder.uri.fsPath);
                totalIngested += count;
            } catch (error) {
                console.error(`[IngestionService] Failed to ingest workspace ${folder.name}:`, error);
            }
        }

        return totalIngested;
    }

    /**
     * Watch for file changes and auto-ingest
     */
    public setupFileWatcher(): vscode.Disposable {
        const watcher = vscode.workspace.createFileSystemWatcher(
            `**/{${this.SUPPORTED_EXTENSIONS.map(ext => `*${ext}`).join(',')}}`
        );

        // On file creation or change, ingest the file
        const onFileChange = async (uri: vscode.Uri) => {
            try {
                await this.ingestFile(uri.fsPath);
                console.log(`[IngestionService] Auto-ingested changed file: ${uri.fsPath}`);
            } catch (error) {
                console.error(`[IngestionService] Failed to auto-ingest file ${uri.fsPath}:`, error);
            }
        };

        watcher.onDidCreate(onFileChange);
        watcher.onDidChange(onFileChange);

        console.log('[IngestionService] File watcher set up');

        return watcher;
    }

    /**
     * Ingest problem tags from solved.ac API
     * @param limit - Maximum number of problems to fetch
     * @returns Number of problems ingested
     */
    public async ingestProblemTags(limit: number = 5000): Promise<number> {
        try {
            console.log(`[IngestionService] Starting to fetch and ingest up to ${limit} problem tags...`);

            const fetcher = SolvedAcTagFetcher.getInstance();
            const problems = await fetcher.fetchProblems(limit);

            console.log(`[IngestionService] Fetched ${problems.length} problems, now ingesting...`);

            let ingestedCount = 0;
            const batchSize = 50; // Process in batches for better progress tracking

            for (let i = 0; i < problems.length; i += batchSize) {
                const batch = problems.slice(i, Math.min(i + batchSize, problems.length));

                try {
                    await this.ingestProblemBatch(batch);
                    ingestedCount += batch.length;

                    console.log(`[IngestionService] Ingested ${ingestedCount}/${problems.length} problems...`);
                } catch (error) {
                    console.error(`[IngestionService] Failed to ingest batch starting at ${i}:`, error);
                    // Continue with next batch
                }
            }

            console.log(`[IngestionService] Successfully ingested ${ingestedCount} problem tags`);
            return ingestedCount;
        } catch (error) {
            console.error('[IngestionService] Problem tag ingestion failed:', error);
            throw error;
        }
    }

    /**
     * Ingest a batch of problems
     * @param problems - Array of problem metadata
     */
    private async ingestProblemBatch(problems: ProblemMetadata[]): Promise<void> {
        const documents: Document[] = [];

        for (const problem of problems) {
            const document = this.createProblemDocument(problem);
            documents.push(document);
        }

        await this.vectorStore.addDocuments(documents);
    }

    /**
     * Create a document from problem metadata
     * @param problem - Problem metadata from solved.ac
     * @returns Document for vector store
     */
    private createProblemDocument(problem: ProblemMetadata): Document {
        const difficultyName = SolvedAcTagFetcher.getDifficultyName(problem.difficulty);

        // Create a rich text representation for embedding
        const content = `
Baekjoon Problem ${problem.problemId}: ${problem.titleKo}
Difficulty: ${difficultyName} (Level ${problem.difficulty})
Tags: ${problem.tags.join(', ')}

Recommended Approach:
${problem.recommendedApproach}

Algorithm Categories: ${problem.tags.join(', ')}
`.trim();

        return {
            content,
            metadata: {
                problemId: problem.problemId.toString(),
                title: problem.titleKo,
                difficulty: problem.difficulty,
                difficultyName,
                tags: problem.tags,
                recommendedApproach: problem.recommendedApproach,
                type: 'boj_tag',
                source: 'solved.ac',
                ingestedAt: new Date().toISOString(),
            },
        };
    }

    /**
     * Ingest specific problem IDs
     * @param problemIds - Array of problem IDs to fetch and ingest
     * @returns Number of problems ingested
     */
    public async ingestSpecificProblems(problemIds: number[]): Promise<number> {
        try {
            console.log(`[IngestionService] Fetching ${problemIds.length} specific problems...`);

            const fetcher = SolvedAcTagFetcher.getInstance();
            const problems = await fetcher.fetchSpecificProblems(problemIds);

            await this.ingestProblemBatch(problems);

            console.log(`[IngestionService] Successfully ingested ${problems.length} specific problems`);
            return problems.length;
        } catch (error) {
            console.error('[IngestionService] Specific problem ingestion failed:', error);
            throw error;
        }
    }

    /**
     * Check if problem tags need to be initialized
     * @returns True if database is empty or has very few tag documents
     */
    public async shouldInitializeTags(): Promise<boolean> {
        try {
            const stats = await this.vectorStore.getStats();

            // Check if we have any boj_tag documents
            // This is a simple heuristic - if we have less than 100 documents,
            // we probably need to initialize
            return stats.documentCount < 100;
        } catch (error) {
            console.error('[IngestionService] Failed to check tag initialization status:', error);
            return true; // Default to initializing if we can't check
        }
    }

    /**
     * Load and ingest BOJ problem tags from bundled JSON file
     * This is the fast, offline method that runs on first launch
     * @param extensionPath - The extension's installation path
     * @returns Number of problems ingested
     */
    public async ingestFromBundledTags(extensionPath: string): Promise<number> {
        try {
            console.log('[IngestionService] Loading pre-fetched BOJ tags from bundle...');

            // Load the bundled JSON file
            const dataPath = path.join(extensionPath, 'data', 'boj-problem-tags.json');

            let tagsData: BOJTagsData;
            try {
                const fileContent = await fs.readFile(dataPath, 'utf-8');
                tagsData = JSON.parse(fileContent);
            } catch (error) {
                console.error('[IngestionService] Failed to load bundled tags:', error);
                throw new Error('Bundled tags file not found. Run "npm run init-boj-tags" to generate it.');
            }

            console.log(`[IngestionService] Loaded ${tagsData.problemCount} problems (generated ${new Date(tagsData.generatedAt).toLocaleString()})`);

            // Ingest in batches
            let ingestedCount = 0;
            const batchSize = 100;

            for (let i = 0; i < tagsData.problems.length; i += batchSize) {
                const batch = tagsData.problems.slice(i, Math.min(i + batchSize, tagsData.problems.length));

                try {
                    await this.ingestProblemBatch(batch);
                    ingestedCount += batch.length;

                    if (ingestedCount % 500 === 0) {
                        console.log(`[IngestionService] Ingested ${ingestedCount}/${tagsData.problemCount} problems...`);
                    }
                } catch (error) {
                    console.error(`[IngestionService] Failed to ingest batch starting at ${i}:`, error);
                    // Continue with next batch
                }
            }

            console.log(`[IngestionService] Successfully ingested ${ingestedCount} problem tags from bundle`);
            return ingestedCount;
        } catch (error) {
            console.error('[IngestionService] Failed to ingest from bundled tags:', error);
            throw error;
        }
    }
}

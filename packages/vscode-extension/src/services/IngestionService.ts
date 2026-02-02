import * as vscode from 'vscode';
import * as path from 'path';
import { glob } from 'glob';
import { promises as fs } from 'fs';
import { VectorStore, Document } from './VectorStore';

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
}

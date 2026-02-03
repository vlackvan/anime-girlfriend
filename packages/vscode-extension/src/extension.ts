import * as vscode from 'vscode';
import * as http from 'http';
import { ChatPanel } from './ChatPanel';
import { ApiKeyManager } from './ApiKeyManager';
import { LocalServer } from './LocalServer';
import { UserDataStore } from './UserDataStore';
import { ChatGPTService } from './ChatGPTService';
import { RAGService } from './services/RAGService';
import { IngestionService } from './services/IngestionService';

export async function activate(context: vscode.ExtensionContext) {
    console.log('[Anime Girlfriend] Extension activating...');

    // Initialize API Key Manager
    const apiKeyManager = new ApiKeyManager(context.secrets);

    // Initialize User Data Store
    const userDataStore = new UserDataStore(context.globalState);

    // Initialize ChatGPT Service
    const chatGPTService = new ChatGPTService(apiKeyManager, userDataStore);

    // Load saved profile and set it in ChatGPT service
    const savedProfile = userDataStore.loadProfile();
    if (savedProfile) {
        chatGPTService.setUserProfile(savedProfile);
        console.log('[Anime Girlfriend] Loaded saved profile for:', savedProfile.character);
    }

    // Initialize RAG services
    const ragService = RAGService.getInstance();
    const ingestionService = IngestionService.getInstance();

    // Set extension path for local BOJ data access
    ragService.setExtensionPath(context.extensionPath);

    // Initialize RAG system
    initializeRAG(ragService, ingestionService, context.extensionPath);

    // Initialize Chat Panel
    const chatPanel = new ChatPanel(
        context.extensionUri,
        apiKeyManager,
        userDataStore,
        chatGPTService
    );

    // Initialize Local Server for BOJ signals
    const port = vscode.workspace.getConfiguration('anime-girlfriend').get('serverPort', 3000);
    const localServer = new LocalServer(port, (data) => {
        console.log('[Anime Girlfriend] BOJ Judge Result:', data);
        chatPanel.showJudgeResult(data);
    });

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('anime-girlfriend.chat', chatPanel)
    );

    // Intercept type command to trigger bongo cat animation
    const typeCommand = vscode.commands.registerCommand('type', async (...args) => {
        // Trigger bongo cat animation in webview
        chatPanel.triggerBongoCat();
        // Pass the keystroke to VS Code so the user can actually type
        return vscode.commands.executeCommand('default:type', ...args);
    });
    context.subscriptions.push(typeCommand);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('anime-girlfriend.showChat', async () => {
            await vscode.commands.executeCommand('anime-girlfriend.chat.focus');
        }),
        vscode.commands.registerCommand('anime-girlfriend.enterApiKey', async () => {
            await apiKeyManager.enterApiKey();
        }),
        vscode.commands.registerCommand('anime-girlfriend.resetProfile', async () => {
            await userDataStore.clearProfile();
            chatGPTService.setUserProfile(undefined);
            chatGPTService.clearHistory();
            chatPanel.sendCommand('goToStep', 'character');
            vscode.window.showInformationMessage('Profile cleared. Starting fresh onboarding.');
        }),
        vscode.commands.registerCommand('anime-girlfriend.retakeSurvey', async () => {
            chatPanel.sendCommand('goToStep', 'survey');
            vscode.window.showInformationMessage('Retaking personality survey...');
        }),
        vscode.commands.registerCommand('anime-girlfriend.debugProfile', async () => {
            const profile = userDataStore.loadProfile();
            const content = profile
                ? JSON.stringify(profile, null, 2)
                : 'No profile found. Please complete the onboarding.';

            const doc = await vscode.workspace.openTextDocument({
                content: content,
                language: 'json'
            });
            await vscode.window.showTextDocument(doc);
        }),
        vscode.commands.registerCommand('anime-girlfriend.ingestSolutions', async () => {
            try {
                vscode.window.showInformationMessage('Scanning workspace for BOJ solutions...');
                const count = await ingestionService.ingestAllWorkspaces();
                vscode.window.showInformationMessage(`Successfully ingested ${count} solution files into RAG memory.`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to ingest solutions: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }),
        vscode.commands.registerCommand('anime-girlfriend.clearMemory', async () => {
            const choice = await vscode.window.showWarningMessage(
                'This will clear all stored RAG memory (solutions and conversations). Continue?',
                'Yes',
                'No'
            );

            if (choice === 'Yes') {
                try {
                    await ragService.clearMemory();
                    vscode.window.showInformationMessage('RAG memory cleared successfully.');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to clear memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }),
        vscode.commands.registerCommand('anime-girlfriend.ragStats', async () => {
            try {
                const stats = await ragService.getStats();
                const message = `RAG System Status:\n\nEnabled: ${stats.isEnabled ? 'Yes' : 'No'}\nDocuments Stored: ${stats.documentCount}\n\nThe RAG system enhances memory by retrieving relevant past solutions and conversations.`;

                vscode.window.showInformationMessage(message);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to get RAG stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }),
        vscode.commands.registerCommand('anime-girlfriend.testRAG', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Enter a test query (e.g., "1149번 어떻게 풀어?" or "다이나믹 프로그래밍")',
                placeHolder: '1149번 어떻게 풀어?'
            });

            if (!query) {
                return;
            }

            try {
                // Detect BOJ problem
                const bojPattern = /(\d{4,5})(?:번|problem)/i;
                const match = query.match(bojPattern);

                let result;
                if (match) {
                    const problemId = match[1];
                    result = await ragService.retrieveBOJContext(problemId);
                    vscode.window.showInformationMessage(`Found ${result.documents.length} documents for BOJ ${problemId}`);
                } else {
                    result = await ragService.retrieveContext(query);
                    vscode.window.showInformationMessage(`Found ${result.documents.length} relevant documents`);
                }

                // Show formatted context in a new document
                const doc = await vscode.workspace.openTextDocument({
                    content: `# RAG Test Results for: "${query}"\n\n` +
                             `Found ${result.documents.length} document(s)\n\n` +
                             `## Document Types:\n${result.documents.map(d => `- ${d.metadata.type} (similarity: ${(d.similarity * 100).toFixed(1)}%)`).join('\n')}\n\n` +
                             `## Formatted Context (This is what gets sent to ChatGPT):\n\n${result.formattedContext || '(empty)'}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
            } catch (error) {
                vscode.window.showErrorMessage(`RAG test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }),
        vscode.commands.registerCommand('anime-girlfriend.ingestProblemTags', async () => {
            const limitInput = await vscode.window.showInputBox({
                prompt: 'How many problems to fetch? (default: 5000, max: 30000)',
                value: '5000',
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1 || num > 30000) {
                        return 'Please enter a number between 1 and 30000';
                    }
                    return null;
                }
            });

            if (!limitInput) {
                return; // User cancelled
            }

            const limit = parseInt(limitInput);

            try {
                vscode.window.showInformationMessage(`Starting to fetch ${limit} problem tags from solved.ac...`);
                const count = await ingestionService.ingestProblemTags(limit);
                vscode.window.showInformationMessage(`Successfully ingested ${count} BOJ problem tags into RAG memory!`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to ingest problem tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        })
    );

    // Cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            localServer.stop();
        }
    });

    console.log('[Anime Girlfriend] Extension activated!');
}

export function deactivate() {
    console.log('[Anime Girlfriend] Extension deactivated');
}

/**
 * Initialize RAG system asynchronously
 */
async function initializeRAG(ragService: RAGService, ingestionService: IngestionService, extensionPath: string): Promise<void> {
    try {
        console.log('[Anime Girlfriend] Initializing RAG system...');

        // Initialize RAG service
        await ragService.initialize();

        // Set up file watcher for auto-ingestion
        ingestionService.setupFileWatcher();

        // Check if we need to populate the database with problem tags
        const needsInit = await ingestionService.shouldInitializeTags();

        if (needsInit) {
            console.log('[Anime Girlfriend] Database is empty. Loading bundled BOJ tags...');
            vscode.window.showInformationMessage(
                'First-time setup: Loading BOJ problem tags... This will take a few seconds.'
            );

            // Load from bundled JSON (fast, no network calls)
            const count = await ingestionService.ingestFromBundledTags(extensionPath);

            console.log(`[Anime Girlfriend] Loaded ${count} problem tags from bundle`);
            vscode.window.showInformationMessage(
                `RAG system initialized with ${count} BOJ problems! You're all set.`
            );
        } else {
            console.log('[Anime Girlfriend] Database already has data, skipping tag initialization');
        }

        // Optionally auto-ingest local solution files on startup (disabled by default)
        const config = vscode.workspace.getConfiguration('anime-girlfriend');
        const autoIngest = config.get('rag.autoIngestOnStartup', false);

        if (autoIngest) {
            console.log('[Anime Girlfriend] Auto-ingesting workspace solutions...');
            const count = await ingestionService.ingestAllWorkspaces();
            console.log(`[Anime Girlfriend] Auto-ingested ${count} solution files`);
        }

        console.log('[Anime Girlfriend] RAG system initialized successfully');
    } catch (error) {
        console.error('[Anime Girlfriend] RAG initialization failed:', error);
        vscode.window.showWarningMessage(
            'Failed to initialize RAG memory system. The extension will work but without enhanced memory. Check that PostgreSQL is running (docker-compose up).'
        );
    }
}

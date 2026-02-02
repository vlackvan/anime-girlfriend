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
    const chatGPTService = new ChatGPTService(apiKeyManager);

    // Load saved profile and set it in ChatGPT service
    const savedProfile = userDataStore.loadProfile();
    if (savedProfile) {
        chatGPTService.setUserProfile(savedProfile);
        console.log('[Anime Girlfriend] Loaded saved profile for:', savedProfile.character);
    }

    // Initialize RAG services
    const ragService = RAGService.getInstance();
    const ingestionService = IngestionService.getInstance();

    // Initialize RAG system
    initializeRAG(ragService, ingestionService);

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
        console.log('[Anime Girlfriend] BOJ Success:', data);
        chatPanel.showOverlay(data.problemId);
    });

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('anime-girlfriend.chat', chatPanel)
    );

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
async function initializeRAG(ragService: RAGService, ingestionService: IngestionService): Promise<void> {
    try {
        console.log('[Anime Girlfriend] Initializing RAG system...');

        // Initialize RAG service
        await ragService.initialize();

        // Set up file watcher for auto-ingestion
        ingestionService.setupFileWatcher();

        // Optionally auto-ingest on startup (can be disabled via setting)
        const autoIngest = vscode.workspace.getConfiguration('anime-girlfriend').get('rag.autoIngestOnStartup', false);

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

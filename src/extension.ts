import * as vscode from 'vscode';
import * as http from 'http';
import { ChatPanel } from './ChatPanel';
import { ApiKeyManager } from './ApiKeyManager';
import { LocalServer } from './LocalServer';

export async function activate(context: vscode.ExtensionContext) {
    console.log('[Anime Girlfriend] Extension activating...');

    // Initialize API Key Manager
    const apiKeyManager = new ApiKeyManager(context.secrets);

    // Initialize Chat Panel
    const chatPanel = new ChatPanel(context.extensionUri, apiKeyManager);

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

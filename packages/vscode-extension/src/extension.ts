import * as vscode from 'vscode';
import * as http from 'http';
import { ChatPanel } from './ChatPanel';
import { ApiKeyManager } from './ApiKeyManager';
import { LocalServer } from './LocalServer';
import { UserDataStore } from './UserDataStore';
import { ChatGPTService } from './ChatGPTService';

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

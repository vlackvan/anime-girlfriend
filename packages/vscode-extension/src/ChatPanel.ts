import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { UserDataStore, StoredUserProfile } from './UserDataStore';
import { ChatGPTService } from './ChatGPTService';
import { SolvedAcService } from './SolvedAcService';

export class ChatPanel implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;
    private apiKeyManager: ApiKeyManager;
    private userDataStore: UserDataStore;
    private chatGPTService: ChatGPTService;
    private solvedAcService: SolvedAcService;

    constructor(
        extensionUri: vscode.Uri,
        apiKeyManager: ApiKeyManager,
        userDataStore: UserDataStore,
        chatGPTService: ChatGPTService
    ) {
        this.extensionUri = extensionUri;
        this.apiKeyManager = apiKeyManager;
        this.userDataStore = userDataStore;
        this.chatGPTService = chatGPTService;
        this.solvedAcService = new SolvedAcService();
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    // Webview is ready, send initial state
                    await this.sendInitialState();
                    break;

                case 'sendMessage':
                    await this.handleChatMessage(message.content);
                    break;

                case 'enterApiKey':
                    await this.apiKeyManager.enterApiKey();
                    break;

                case 'saveProfile':
                    await this.handleSaveProfile(message.data);
                    break;

                case 'clearProfile':
                    await this.userDataStore.clearProfile();
                    this.chatGPTService.setUserProfile(undefined);
                    this.chatGPTService.clearHistory();
                    break;

                case 'fetchSolvedacStats':
                    await this.handleFetchSolvedacStats(message.handle);
                    break;

                case 'generatePersonality':
                    await this.handleGeneratePersonality(message.data);
                    break;
            }
        });
    }

    private async sendInitialState() {
        const profile = this.userDataStore.loadProfile();
        const hasApiKey = await this.apiKeyManager.hasApiKey();

        this.postMessage({
            type: 'initialState',
            data: {
                hasProfile: profile !== undefined,
                profile: profile,
                hasApiKey: hasApiKey
            }
        });
    }

    private async handleSaveProfile(profileData: any) {
        const profile: Omit<StoredUserProfile, 'createdAt' | 'updatedAt'> = {
            character: profileData.character,
            demographics: profileData.demographics,
            bfi: profileData.bfi,
            pvq: profileData.pvq,
            personalitySummary: profileData.analysis,
            solvedAcData: profileData.solvedAcData
        };

        await this.userDataStore.saveProfile(profile);

        // Update ChatGPT service with the new profile
        const savedProfile = this.userDataStore.loadProfile();
        if (savedProfile) {
            this.chatGPTService.setUserProfile(savedProfile);
        }

        this.postMessage({
            type: 'profileSaved',
            success: true
        });
    }

    private async handleFetchSolvedacStats(handle: string) {
        try {
            console.log('[ChatPanel] Fetching Solved.ac stats for:', handle);
            const stats = await this.solvedAcService.getStatsSummary(handle);

            this.postMessage({
                type: 'solvedacStatsFetched',
                data: stats
            });
        } catch (error) {
            console.error('[ChatPanel] Failed to fetch Solved.ac stats:', error);
            this.postMessage({
                type: 'solvedacStatsFetched',
                error: error instanceof Error ? error.message : '통계를 가져오는데 실패했습니다.'
            });
        }
    }

    private async handleGeneratePersonality(data: any) {
        try {
            console.log('[ChatPanel] Generating personality analysis...');

            const { bfi, pvq, character, contextSummary, demographics, solvedAcData } = data;

            // Call OpenAI to generate personality analysis
            const personalitySummary = await this.chatGPTService.generatePersonalityAnalysis(
                bfi,
                pvq,
                character,
                contextSummary,
                demographics
            );

            console.log('[ChatPanel] Personality generated successfully');

            this.postMessage({
                type: 'personalityGenerated',
                summary: personalitySummary,
                contextSummary: contextSummary,
                solvedAcData: solvedAcData // Send back the solvedAcData that was received
            });
        } catch (error) {
            console.error('[ChatPanel] Failed to generate personality:', error);
            this.postMessage({
                type: 'personalityGenerationError',
                error: error instanceof Error ? error.message : '성격 분석 생성에 실패했습니다.'
            });
        }
    }

    private async handleChatMessage(content: string) {
        console.log('[ChatPanel] User message:', content);

        // Check for API key
        const hasApiKey = await this.apiKeyManager.hasApiKey();
        if (!hasApiKey) {
            this.postMessage({
                type: 'botMessage',
                content: '❌ No API key configured. Please use the command "Anime Girlfriend: Enter OpenAI API Key" to set your key.',
                isComplete: true
            });
            return;
        }

        // Start streaming response
        this.postMessage({
            type: 'botMessageStart',
            id: Date.now().toString()
        });

        await this.chatGPTService.sendMessage(content, {
            onToken: (token) => {
                this.postMessage({
                    type: 'botMessageToken',
                    token: token
                });
            },
            onComplete: (fullResponse) => {
                this.postMessage({
                    type: 'botMessageComplete',
                    content: fullResponse
                });
            },
            onError: (error) => {
                console.error('[ChatPanel] ChatGPT Error:', error);
                this.postMessage({
                    type: 'botMessageError',
                    error: error.message
                });
            }
        });
    }

    showOverlay(problemId: string) {
        this.postMessage({
            type: 'showOverlay',
            problemId: problemId
        });
    }

    sendCommand(command: string, data?: any) {
        this.postMessage({
            type: 'command',
            command: command,
            data: data
        });
    }

    private postMessage(message: any) {
        this.view?.webview.postMessage(message);
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'assets', 'styles.css')
        );
        const aruImageUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'assets', 'aru.webp')
        );
        const chihiroImageUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'assets', 'chihiro.jpg')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Anime Girlfriend</title>
</head>
<body>
  <div id="root"></div>
  <script>
    window.assetBaseUri = {
      aru: "${aruImageUri}",
      chihiro: "${chihiroImageUri}"
    };
    window.vscode = acquireVsCodeApi();
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}


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
                    await this.handleChatMessage(message.content, false, message.images);
                    break;

                case 'heartAction':
                    await this.handleHeartAction();
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

                case 'triggerGreeting':
                    // Force the AI to generate the first greeting based on the rules
                    await this.handleChatMessage("(Start the conversation with the 'Chat rule_first reply' defined in your instructions.)", true);
                    break;

                case 'welcomeBack':
                    // Trigger a welcome back message
                    await this.handleChatMessage("(The User has returned to the app. Welcome him back to the shared workspace. Be casual, referencing the time or just successful return. Use your Persona.)", true);
                    break;
            }
        });
    }

    private async sendInitialState() {
        const profile = this.userDataStore.loadProfile();
        const hasApiKey = await this.apiKeyManager.hasApiKey();

        const history = this.chatGPTService.getHistory(); // You might need to add this method to ChatGPTService first if not exists

        this.postMessage({
            type: 'initialState',
            data: {
                hasProfile: profile !== undefined,
                profile: profile,
                hasApiKey: hasApiKey,
                historyLength: history.length
            }
        });
    }

    private async handleSaveProfile(profileData: any) {
        const profile: Omit<StoredUserProfile, 'createdAt' | 'updatedAt'> = {
            character: profileData.character,
            demographics: profileData.demographics,
            essays: profileData.essays,
            analysis: profileData.analysis,
            coreMemories: profileData.coreMemories,
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

    private async handleHeartAction() {
        try {
            // Check for API key
            const hasApiKey = await this.apiKeyManager.hasApiKey();
            if (!hasApiKey) {
                this.postMessage({
                    type: 'botMessage',
                    content: '❌ No API key configured.',
                    isComplete: true
                });
                return;
            }

            // Start streaming (or pseudo-streaming since it's short)
            // Actually generateLoveMessage returns a string, not stream.
            // We can just simulate stream or send as full message.
            this.postMessage({
                type: 'botMessageStart',
                id: Date.now().toString()
            });

            // Show typing indicator... handled by frontend if we don't send tokens immediately? 
            // Frontend shows '...' if botMessageStart is received but no tokens yet.

            const loveMessage = await this.chatGPTService.generateLoveMessage();

            this.postMessage({
                type: 'botMessageComplete',
                content: loveMessage
            });

        } catch (error) {
            this.postMessage({
                type: 'botMessageError',
                error: "Failed to generate love message."
            });
        }
    }

    private async handleGeneratePersonality(data: any) {
        try {
            console.log('[ChatPanel] Generating personality analysis...');

            const { essays, character, contextSummary, demographics, solvedAcData } = data;

            // 1. Generate Personality Analysis
            const personalitySummary = await this.chatGPTService.generatePersonalityAnalysis(
                essays,
                character,
                contextSummary,
                demographics
            );

            console.log('[ChatPanel] Personality analysis complete. Generating Core Memories...');

            // 2. Generate Core Memories
            const coreMemories = await this.chatGPTService.generateCoreMemories(
                personalitySummary,
                character,
                essays,
                contextSummary // passed as solvedAcSummary
            );

            console.log('[ChatPanel] Core Memories generated successfully');

            this.postMessage({
                type: 'personalityGenerated',
                summary: personalitySummary,
                coreMemories: coreMemories,
                contextSummary: contextSummary,
                solvedAcData: solvedAcData
            });
        } catch (error) {
            console.error('[ChatPanel] Failed to generate personality:', error);
            this.postMessage({
                type: 'personalityGenerationError',
                error: error instanceof Error ? error.message : '성격 분석 생성에 실패했습니다.'
            });
        }
    }

    private async handleChatMessage(content: string, isHidden: boolean = false, images?: string[]) {
        if (!isHidden) {
            console.log('[ChatPanel] User message:', content);
        }

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
        }, images);
    }

    showOverlay(problemId: string) {
        this.postMessage({
            type: 'showOverlay',
            problemId: problemId,
            status: 'accepted'
        });
    }

    showJudgeResult(result: any) {
        this.postMessage({
            type: 'showJudgeResult',
            problemId: result.problemId,
            resultText: result.resultText,
            status: result.status,
            memory: result.memory,
            time: result.time
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
            vscode.Uri.joinPath(this.extensionUri, 'assets', 'aru.png')
        );
        const chihiroImageUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'assets', 'chihiro.png')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; media-src ${webview.cspSource} https: mediastream: blob:; connect-src https:;">
  <meta http-equiv="Permissions-Policy" content="microphone=(self)">
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


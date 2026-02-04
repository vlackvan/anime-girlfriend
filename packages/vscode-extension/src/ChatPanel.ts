import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { UserDataStore, StoredUserProfile } from './UserDataStore';
import { ChatGPTService } from './ChatGPTService';
import { SolvedAcService } from './SolvedAcService';
import { getCharacter, getAvailableCharacters } from './characters';

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

    // Method to trigger bongo cat animation from type command
    triggerBongoCat() {
        this.postMessage({
            type: 'bongoCatStroke'
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
            console.log('[ChatPanel] Starting chat pipeline...');
        }

        // Check for API key
        const hasApiKey = await this.apiKeyManager.hasApiKey();
        if (!hasApiKey) {
            console.error('[ChatPanel] No API key configured');
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

        console.log('[ChatPanel] About to call chatGPTService.sendMessage()...');
        try {
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
            onMessage: (message, isLast) => {
                // Send a split message
                this.postMessage({
                    type: 'botMessageSplit',
                    content: message,
                    isLast: isLast
                });
            },
            onError: (error) => {
                console.error('[ChatPanel] ChatGPT Error:', error);
                console.error('[ChatPanel] Error details:', error.message, error.stack);
                this.postMessage({
                    type: 'botMessageError',
                    error: error.message
                });
            }
        }, images);
        console.log('[ChatPanel] sendMessage() call completed');
        } catch (error) {
            console.error('[ChatPanel] Exception in sendMessage():', error);
            console.error('[ChatPanel] Exception details:', error instanceof Error ? error.stack : String(error));
            this.postMessage({
                type: 'botMessageError',
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
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
        try {
            const scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview.js')
            );
            const styleUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'assets', 'styles.css')
            );
            // Load character images from character registry
            const characters = getAvailableCharacters();
            
            const characterImageUris: Record<string, string> = {};
            const characterPortraitUris: Record<string, string> = {};
            
            for (const charId of characters) {
                const charDef = getCharacter(charId);
                const imageUri = webview.asWebviewUri(
                    vscode.Uri.joinPath(this.extensionUri, charDef.config.imagePath)
                );
                const portraitUri = webview.asWebviewUri(
                    vscode.Uri.joinPath(this.extensionUri, charDef.config.portraitPath)
                );
                characterImageUris[charId] = imageUri.toString();
                characterPortraitUris[charId] = portraitUri.toString();
            }
            
            // Build asset URI object string for JavaScript
            const assetUriEntries: string[] = [];
            for (const charId of characters) {
                assetUriEntries.push(`${charId}: "${characterImageUris[charId]}"`);
                assetUriEntries.push(`${charId}Portrait: "${characterPortraitUris[charId]}"`);
            }
            
            const bongoIdleUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'assets', 'bongo_middle.png')
            );
            const bongoLeftUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'assets', 'bongo_left.png')
            );
            const bongoRightUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'assets', 'bongo_right.png')
            );
            const loadingImageUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, 'assets', 'loading.png')
            );

            console.log('[ChatPanel] Extension URI:', this.extensionUri.toString());
            console.log('[ChatPanel] Script URI:', scriptUri.toString());

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
      ${assetUriEntries.join(',\n      ')},
      bongoIdle: "${bongoIdleUri}",
      bongoLeft: "${bongoLeftUri}",
      bongoRight: "${bongoRightUri}",
      loading: "${loadingImageUri}"
    };
    window.vscode = acquireVsCodeApi();
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
        } catch (error) {
            console.error('[ChatPanel] Error generating HTML content:', error);
            // Return a minimal error page if URI generation fails
            return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Anime Girlfriend - Error</title>
</head>
<body>
  <h1>Extension Error</h1>
  <p>Failed to load webview. Please check the Developer Console for details.</p>
  <pre>${error instanceof Error ? error.message : 'Unknown error'}</pre>
</body>
</html>`;
        }
    }
}


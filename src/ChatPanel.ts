import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';

export class ChatPanel implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;
    private apiKeyManager: ApiKeyManager;

    constructor(extensionUri: vscode.Uri, apiKeyManager: ApiKeyManager) {
        this.extensionUri = extensionUri;
        this.apiKeyManager = apiKeyManager;
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
                case 'sendMessage':
                    await this.handleChatMessage(message.content);
                    break;
                case 'enterApiKey':
                    await this.apiKeyManager.enterApiKey();
                    break;
                case 'onboardingComplete':
                    this.postMessage({ type: 'onboardingComplete', data: message.data });
                    break;
            }
        });
    }

    private async handleChatMessage(content: string) {
        // TODO: Integrate with ChatGPT API
        console.log('[ChatPanel] User message:', content);

        // For now, echo back a simple response
        this.postMessage({
            type: 'botMessage',
            content: `I received: "${content}". (ChatGPT integration coming soon!)`
        });
    }

    showOverlay(problemId: string) {
        this.postMessage({
            type: 'showOverlay',
            problemId: problemId
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

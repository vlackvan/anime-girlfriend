import * as vscode from 'vscode';

export class ApiKeyManager {
    private static readonly KEY = 'anime-girlfriend.openai-api-key';
    private secrets: vscode.SecretStorage;
    private onUpdateEmitter = new vscode.EventEmitter<void>();
    readonly onUpdate = this.onUpdateEmitter.event;

    constructor(secrets: vscode.SecretStorage) {
        this.secrets = secrets;
    }

    async getApiKey(): Promise<string | undefined> {
        return this.secrets.get(ApiKeyManager.KEY);
    }

    async hasApiKey(): Promise<boolean> {
        const key = await this.getApiKey();
        return key !== undefined && key.length > 0;
    }

    async enterApiKey(): Promise<void> {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your OpenAI API Key',
            password: true,
            placeHolder: 'sk-...',
            validateInput: (value) => {
                if (!value.startsWith('sk-')) {
                    return 'API key should start with "sk-"';
                }
                return undefined;
            }
        });

        if (key) {
            await this.secrets.store(ApiKeyManager.KEY, key);
            this.onUpdateEmitter.fire();
            vscode.window.showInformationMessage('OpenAI API key saved!');
        }
    }

    async clearApiKey(): Promise<void> {
        await this.secrets.delete(ApiKeyManager.KEY);
        this.onUpdateEmitter.fire();
        vscode.window.showInformationMessage('OpenAI API key cleared.');
    }
}

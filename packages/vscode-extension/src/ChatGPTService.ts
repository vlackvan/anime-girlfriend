import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { StoredUserProfile, UserDataStore } from './UserDataStore';
import { CodeContextProvider } from './CodeContextProvider';
import { generateCoDPrompt, generateCoreMemoriesPrompt } from './webview/personality/promptEngine';
import { UserEssays, Character } from './webview/personality/types';
import { RAGService } from './services/RAGService';
import { SolvedAcService } from './SolvedAcService';
import { ContextAggregator } from './services/workers/ContextAggregator';
import { StrategyAgent } from './services/workers/StrategyAgent';
import { PersonaWrapper } from './services/workers/PersonaWrapper';
import { PersonaPromptBuilder } from './services/prompts/PersonaPromptBuilder';
import { AggregatedContext } from './types/PipelineTypes';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamCallbacks {
    onToken: (token: string) => void;
    onComplete: (fullResponse: string) => void;
    onError: (error: Error) => void;
}

export class ChatGPTService {
    private apiKeyManager: ApiKeyManager;
    private userDataStore: UserDataStore;
    private codeContextProvider: CodeContextProvider;
    private ragService: RAGService;
    private solvedAcService: SolvedAcService;
    private conversationHistory: ChatMessage[] = [];
    private userProfile?: StoredUserProfile;
    private outputChannel: vscode.OutputChannel;

    // Workers
    private contextAggregator: ContextAggregator;
    private strategyAgent: StrategyAgent;
    private personaWrapper: PersonaWrapper;

    constructor(apiKeyManager: ApiKeyManager, userDataStore: UserDataStore) {
        this.apiKeyManager = apiKeyManager;
        this.userDataStore = userDataStore;
        this.codeContextProvider = new CodeContextProvider();
        this.ragService = RAGService.getInstance();
        this.solvedAcService = new SolvedAcService();
        this.outputChannel = vscode.window.createOutputChannel('Anime Girlfriend Pipeline');

        // Initialize workers
        this.contextAggregator = new ContextAggregator(
            this.ragService,
            this.codeContextProvider,
            this.userDataStore,
            this.userProfile,
            (msg: string, data?: any) => this.logPipeline(msg, data)
        );
        this.strategyAgent = new StrategyAgent(
            (msg: string, data?: any) => this.logPipeline(msg, data)
        );
        this.personaWrapper = new PersonaWrapper(
            this.userProfile,
            (msg: string, data?: any) => this.logPipeline(msg, data)
        );

        // Initialize RAG service asynchronously
        this.initializeRAG();
    }

    /**
     * Initialize RAG service
     */
    private async initializeRAG(): Promise<void> {
        try {
            await this.ragService.initialize();
            console.log('[ChatGPTService] RAG service initialized');
        } catch (error) {
            console.error('[ChatGPTService] Failed to initialize RAG:', error);
        }
    }

    /**
     * Set the user profile for personalization
     */
    setUserProfile(profile: StoredUserProfile | undefined) {
        this.userProfile = profile;
        // Update workers with new profile
        this.contextAggregator = new ContextAggregator(
            this.ragService,
            this.codeContextProvider,
            this.userDataStore,
            this.userProfile,
            (msg: string, data?: any) => this.logPipeline(msg, data)
        );
        this.personaWrapper.setUserProfile(this.userProfile);
    }

    /**
     * Clear conversation history (new session)
     */
    clearHistory() {
        this.conversationHistory = [];
    }

    /**
     * Get conversation history
     */
    getHistory(): ChatMessage[] {
        return this.conversationHistory;
    }

    /**
     * Orchestrator: Send a message and stream the response using 3-step Worker pipeline
     */
    async sendMessage(userMessage: string, callbacks: StreamCallbacks, images?: string[]): Promise<void> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            callbacks.onError(new Error('No API key configured. Please enter your OpenAI API key.'));
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            this.logPipeline(`\n${'='.repeat(80)}`);
            this.logPipeline(`[${timestamp}] Pipeline Started`);
            this.logPipeline(`${'='.repeat(80)}`);

            // Step 1: Worker A - Context Aggregator
            this.logPipeline(`\n🔍 [Worker A] Context Aggregator - Starting...`);
            this.logPipeline(`Input: User Message = "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
            if (images && images.length > 0) {
                this.logPipeline(`Input: Images = ${images.length} image(s) attached`);
            }

            const context = await this.contextAggregator.aggregate(userMessage);

            // Log Worker A output
            this.logPipeline(`\n✅ [Worker A] Context Aggregated:`);
            this.logPipeline(`  - Problem ID: ${context.problemId || 'None'}`);
            this.logPipeline(`  - User Tier: ${context.userTierName || 'Unknown'} (Level ${context.userTier || 0})`);
            this.logPipeline(`  - Hint Level: ${context.hintLevel}`);
            if (context.localBOJData) {
                this.logPipeline(`  - Problem Difficulty: ${context.localBOJData.difficultyName} (Level ${context.localBOJData.difficulty})`);
                this.logPipeline(`  - Problem Tags: ${context.localBOJData.tags.join(', ')}`);
            }
            this.logPipeline(`  - RAG Context Length: ${context.ragContext.length} chars`);
            this.logPipeline(`  - Code Context Length: ${context.codeContext.length} chars`);
            this.logPipeline(`\n📦 [Worker A → Worker B] Context Object:`, context);

            // Step 2: Worker B - Logic & Strategy Agent (only for BOJ problems)
            let strategyHint = '';
            if (context.problemId) {
                this.logPipeline(`\n🧠 [Worker B] Logic & Strategy Agent - Starting...`);
                this.logPipeline(`Input: User Message = "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
                this.logPipeline(`Input: Context (problemId=${context.problemId}, hintLevel=${context.hintLevel})`);

                strategyHint = await this.strategyAgent.generateHint(userMessage, context, apiKey);
                
                // Log Worker B output
                this.logPipeline(`\n✅ [Worker B] Strategy Hint Generated:`);
                this.logPipeline(`  - Hint Level: ${context.hintLevel}`);
                this.logPipeline(`  - Hint Length: ${strategyHint.length} chars`);
                this.logPipeline(`  - Hint Content: "${strategyHint}"`);
                this.logPipeline(`\n📦 [Worker B → Worker C] Strategy Hint:`, strategyHint);

                // Increment hint level for this problem
                const newHintLevel = await this.userDataStore.incrementHintLevel(context.problemId);
                this.logPipeline(`  - Hint Level Updated: ${context.hintLevel} → ${newHintLevel}`);
            } else {
                this.logPipeline(`\n⏭️  [Worker B] Skipped (No BOJ problem detected)`);
                this.logPipeline(`\n📦 [Worker B → Worker C] Using original message`);
            }

            // Step 3: Worker C - Persona Wrapper Agent
            this.logPipeline(`\n🎭 [Worker C] Persona Wrapper Agent - Starting...`);
            this.logPipeline(`Input: Original Message = "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
            this.logPipeline(`Input: Strategy Hint = "${strategyHint || '(using original message)'}"`);
            this.logPipeline(`Input: Context (character=${this.userProfile?.character || 'unknown'})`);

            const finalResponse = await this.personaWrapper.wrap(
                userMessage,
                strategyHint || userMessage, // Use strategy hint if available, otherwise original message
                context,
                apiKey,
                images,
                this.conversationHistory,
                callbacks
            );

            // Log Worker C output
            this.logPipeline(`\n✅ [Worker C] Final Response Generated:`);
            this.logPipeline(`  - Response Length: ${finalResponse.length} chars`);
            this.logPipeline(`  - Response Preview: "${finalResponse.substring(0, 150)}${finalResponse.length > 150 ? '...' : ''}"`);
            this.logPipeline(`\n📦 [Worker C → User] Final Response:`, finalResponse);

            // Add to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: userMessage
            });
            this.conversationHistory.push({
                role: 'assistant',
                content: finalResponse
            });

            this.logPipeline(`\n${'='.repeat(80)}`);
            this.logPipeline(`[${new Date().toISOString()}] Pipeline Completed`);
            this.logPipeline(`${'='.repeat(80)}\n`);

            callbacks.onComplete(finalResponse);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logPipeline(`\n❌ [Pipeline Error] ${errorMessage}`);
            this.logPipeline(`Error Stack:`, error instanceof Error ? error.stack : 'No stack trace');
            console.error('[ChatGPTService] Pipeline error:', error);
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Log pipeline data to both console and output channel
     */
    private logPipeline(message: string, data?: any): void {
        // Log to console
        console.log(message);
        if (data !== undefined) {
            console.log(JSON.stringify(data, null, 2));
        }

        // Log to output channel
        this.outputChannel.appendLine(message);
        if (data !== undefined) {
            try {
                // Format data nicely
                if (typeof data === 'object') {
                    this.outputChannel.appendLine(JSON.stringify(data, null, 2));
                } else {
                    this.outputChannel.appendLine(String(data));
                }
            } catch (e) {
                this.outputChannel.appendLine(`[Unable to serialize data: ${e}]`);
            }
        }
    }

    /**
     * Generate a special 1-sentence love message (Heart Action)
     */
    async generateLoveMessage(): Promise<string> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) return "Error: No API Key";

        // Create empty context for persona prompt
        const emptyContext: AggregatedContext = {
            ragContext: '',
            codeContext: this.codeContextProvider.buildContextString(),
            hintLevel: 0
        };
        const promptBuilder = new PersonaPromptBuilder(this.userProfile);
        const systemPrompt = promptBuilder.build(emptyContext);

        // We inject a fake "User" message to trigger the specific response.
        // This ensures the model treats this as a fresh turn to respond to.
        const triggerMessage = {
            role: 'user',
            content: `[SYSTEM EVENT] User pressed the 'Heart Button'.
ACTION REQUIRED: Disengage "Tough Love". Engage "Decre" (Sweet) Mode.
OUTPUT: One genuine, romantic, affectionate sentence IN CHARACTER.
LANGUAGE: Respond in Korean (한국어) ONLY.`
        };

        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-5),
            triggerMessage // Force the model to respond to this
        ] as any[];

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.8, // Slightly higher temp for emotion
                    max_tokens: 100
                })
            });

            if (!response.ok) return "서버 오류가 발생했습니다.";

            const data: any = await response.json();
            const content = data.choices[0].message.content.trim();

            // Add to history so she remembers saying it
            this.conversationHistory.push({ role: 'assistant', content });
            return content;

        } catch (e) {
            return "지금은 좀 부끄러운걸...";
        }
    }

    /**
     * Generate personality analysis using CoD pipeline
     */
    async generatePersonalityAnalysis(
        essays: UserEssays,
        character: Character,
        solvedAcSummary: string,
        demographics?: any
    ): Promise<string> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        const prompt = generateCoDPrompt(essays, character, solvedAcSummary, demographics);
        const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: prompt }],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            throw new Error(`Analysis failed: ${response.status}`);
        }

        const data: any = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Generate Core Memories (Doppelgänger Interview)
     */
    async generateCoreMemories(
        analysis: string,
        character: Character,
        essays: UserEssays,
        solvedAcSummary: string
    ): Promise<any> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        const prompt = generateCoreMemoriesPrompt(character, essays, solvedAcSummary);

        const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: prompt }],
                temperature: 0.7,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`Core Memories generation failed: ${response.status}`);
        }

        const data: any = await response.json();
        return JSON.parse(data.choices[0].message.content);
    }

}

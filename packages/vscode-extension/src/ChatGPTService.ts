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
    onMessage?: (message: string, isLast: boolean) => void; // For split messages
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

        // Initialize workers
        this.contextAggregator = new ContextAggregator(
            this.ragService,
            this.codeContextProvider,
            this.userDataStore,
            this.userProfile
        );
        this.strategyAgent = new StrategyAgent();
        this.personaWrapper = new PersonaWrapper(this.userProfile);

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
            this.userProfile
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
        console.log('[ChatGPTService] sendMessage() called with message length:', userMessage.length);
        
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            console.error('[ChatGPTService] No API key found');
            callbacks.onError(new Error('No API key configured. Please enter your OpenAI API key.'));
            return;
        }

        console.log('[ChatGPTService] API key found, starting pipeline...');

        try {
            const timestamp = new Date().toISOString();
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[${timestamp}] Pipeline Started`);
            console.log(`${'='.repeat(80)}`);

            // Step 1: Worker A - Context Aggregator
            console.log(`\n🔍 [Worker A] Context Aggregator - Starting...`);
            console.log(`Input: User Message = "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
            if (images && images.length > 0) {
                console.log(`Input: Images = ${images.length} image(s) attached`);
            }

            console.log('[ChatGPTService] Calling contextAggregator.aggregate()...');
            const context = await this.contextAggregator.aggregate(userMessage);
            console.log('[ChatGPTService] Context aggregation completed');

            // Log Worker A output
            console.log(`\n✅ [Worker A] Context Aggregated:`);
            console.log(`  - Problem ID: ${context.problemId || 'None'}`);
            console.log(`  - User Tier: ${context.userTierName || 'Unknown'} (Level ${context.userTier || 0})`);
            console.log(`  - Hint Level: ${context.hintLevel}`);
            if (context.localBOJData) {
                console.log(`  - Problem Difficulty: ${context.localBOJData.difficultyName} (Level ${context.localBOJData.difficulty})`);
                console.log(`  - Problem Tags: ${context.localBOJData.tags.join(', ')}`);
            }
            console.log(`  - RAG Context Length: ${context.ragContext.length} chars`);
            console.log(`  - Code Context Length: ${context.codeContext.length} chars`);
            console.log(`\n📦 [Worker A → Worker B] Context Object:`, context);

            // Step 2: Worker B - Logic & Strategy Agent (only for BOJ problems)
            let strategyHint = '';
            if (context.problemId) {
                console.log(`\n🧠 [Worker B] Logic & Strategy Agent - Starting...`);
                console.log(`Input: User Message = "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
                console.log(`Input: Context (problemId=${context.problemId}, hintLevel=${context.hintLevel})`);
                console.log('[ChatGPTService] Calling strategyAgent.generateHint()...');

                strategyHint = await this.strategyAgent.generateHint(userMessage, context, apiKey);
                console.log('[ChatGPTService] Strategy hint generation completed, hint length:', strategyHint.length);
                
                // Log Worker B output
                console.log(`\n✅ [Worker B] Strategy Hint Generated:`);
                console.log(`  - Hint Level: ${context.hintLevel}`);
                console.log(`  - Hint Length: ${strategyHint.length} chars`);
                console.log(`  - Hint Content: "${strategyHint}"`);
                console.log(`\n📦 [Worker B → Worker C] Strategy Hint:`, strategyHint);

                // Increment hint level for this problem
                const newHintLevel = await this.userDataStore.incrementHintLevel(context.problemId);
                console.log(`  - Hint Level Updated: ${context.hintLevel} → ${newHintLevel}`);
            } else {
                console.log(`\n⏭️  [Worker B] Skipped (No BOJ problem detected)`);
                console.log(`\n📦 [Worker B → Worker C] Using original message`);
            }

            // Step 3: Worker C - Persona Wrapper Agent
            console.log(`\n🎭 [Worker C] Persona Wrapper Agent - Starting...`);
            console.log(`Input: Original Message = "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
            console.log(`Input: Strategy Hint = "${strategyHint || '(using original message)'}"`);
            console.log(`Input: Context (character=${this.userProfile?.character || 'unknown'})`);
            console.log('[ChatGPTService] Calling personaWrapper.wrap()...');

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
            console.log(`\n✅ [Worker C] Final Response Generated:`);
            console.log(`  - Response Length: ${finalResponse.length} chars`);
            console.log(`  - Response Preview: "${finalResponse.substring(0, 150)}${finalResponse.length > 150 ? '...' : ''}"`);
            console.log(`\n📦 [Worker C → User] Final Response:`, finalResponse);

            // Add to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: userMessage
            });
            this.conversationHistory.push({
                role: 'assistant',
                content: finalResponse
            });

            console.log(`\n${'='.repeat(80)}`);
            console.log(`[${new Date().toISOString()}] Pipeline Completed`);
            console.log(`${'='.repeat(80)}\n`);

            callbacks.onComplete(finalResponse);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`\n❌ [Pipeline Error] ${errorMessage}`);
            console.error('[ChatGPTService] Error type:', error instanceof Error ? error.constructor.name : typeof error);
            if (error instanceof Error && error.stack) {
                console.error(`Error Stack:`, error.stack);
            }
            console.error('[ChatGPTService] Full error object:', error);
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
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

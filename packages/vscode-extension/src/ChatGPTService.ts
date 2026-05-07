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
import { getCharacter } from './characters';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamCallbacks {
    onToken: (token: string) => void;
    onComplete: (fullResponse: string, newHintLevel?: number) => void;
    onQuickComplete?: (quickContent: string) => void; // Dual pipeline: quick response done, follow-up starting
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
    async sendMessage(userMessage: string, callbacks: StreamCallbacks, images?: string[], shouldAdvanceHint: boolean = false): Promise<void> {
        console.log('[ChatGPTService] sendMessage() called with message length:', userMessage.length);
        console.log('[ChatGPTService] shouldAdvanceHint:', shouldAdvanceHint);

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

            // Step 2: Dual Pipeline (BOJ) or Direct Response (non-BOJ)
            if (context.problemId) {
                // ═══ DUAL PIPELINE: Quick Response (GPT-4o-mini) + Strategy Hint (GPT-4o) in parallel ═══
                console.log(`\n🚀 [Dual Pipeline] Starting parallel execution for problem ${context.problemId}...`);

                // Handle hint advancement before parallel calls
                if (shouldAdvanceHint) {
                    const oldHintLevel = context.hintLevel;
                    const newHintLevel = await this.userDataStore.incrementHintLevel(context.problemId);
                    context.hintLevel = newHintLevel;
                    console.log(`  - Hint Level Advanced: ${oldHintLevel} → ${newHintLevel}`);
                } else {
                    console.log(`  - Hint Level: ${context.hintLevel} (no advancement)`);
                }

                // Run quick GPT-4o-mini response AND Worker B (GPT-4o strategy) in parallel
                console.log(`  [Quick Response] GPT-4o-mini streaming to UI immediately...`);
                console.log(`  [Worker B] GPT-4o generating strategy hint in background...`);

                const quickStartTime = Date.now();
                const [quickResponse, strategyHint] = await Promise.all([
                    this.generateQuickResponse(userMessage, context, apiKey, callbacks),
                    this.strategyAgent.generateHint(userMessage, context, apiKey)
                ]);
                const parallelTime = Date.now() - quickStartTime;

                console.log(`\n✅ [Dual Pipeline] Parallel phase completed in ${parallelTime}ms`);
                console.log(`  - Quick Response (${quickResponse.length} chars): "${quickResponse.substring(0, 80)}..."`);
                console.log(`  - Strategy Hint (${strategyHint.length} chars): "${strategyHint.substring(0, 80)}..."`);

                // Signal quick response is complete → UI transitions to follow-up streaming message
                if (callbacks.onQuickComplete) {
                    callbacks.onQuickComplete(quickResponse);
                }

                // Step 3: Worker C - Persona Wrapper with strategy hint (streams into follow-up message)
                console.log(`\n🎭 [Worker C] Persona Wrapper - Wrapping strategy hint with persona...`);

                const finalResponse = await this.personaWrapper.wrap(
                    userMessage,
                    strategyHint,
                    context,
                    apiKey,
                    images,
                    this.conversationHistory,
                    callbacks
                );

                console.log(`\n✅ [Worker C] Final Response (${finalResponse.length} chars): "${finalResponse.substring(0, 150)}..."`);

                // Add to conversation history (combine both responses for context continuity)
                this.conversationHistory.push({ role: 'user', content: userMessage });
                this.conversationHistory.push({ role: 'assistant', content: quickResponse + '\n\n' + finalResponse });

                console.log(`\n${'='.repeat(80)}`);
                console.log(`[${new Date().toISOString()}] Dual Pipeline Completed`);
                console.log(`${'='.repeat(80)}\n`);

                callbacks.onComplete(finalResponse, context.hintLevel);

            } else {
                // ═══ SINGLE PIPELINE: Direct persona response (non-BOJ) ═══
                console.log(`\n⏭️  [Worker B] Skipped (No BOJ problem detected)`);
                console.log(`\n🎭 [Worker C] Persona Wrapper Agent - Starting...`);

                const finalResponse = await this.personaWrapper.wrap(
                    userMessage,
                    userMessage,
                    context,
                    apiKey,
                    images,
                    this.conversationHistory,
                    callbacks
                );

                console.log(`\n✅ [Worker C] Final Response (${finalResponse.length} chars): "${finalResponse.substring(0, 150)}..."`);

                this.conversationHistory.push({ role: 'user', content: userMessage });
                this.conversationHistory.push({ role: 'assistant', content: finalResponse });

                console.log(`\n${'='.repeat(80)}`);
                console.log(`[${new Date().toISOString()}] Pipeline Completed`);
                console.log(`${'='.repeat(80)}\n`);

                callbacks.onComplete(finalResponse, context.hintLevel);
            }

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
     * Dual Pipeline: Generate a quick acknowledgment response via GPT-4o-mini (streamed immediately)
     * Runs in parallel with Worker B (GPT-4o strategy hint) to eliminate perceived latency.
     */
    private async generateQuickResponse(
        userMessage: string,
        context: AggregatedContext,
        apiKey: string,
        callbacks: StreamCallbacks
    ): Promise<string> {
        const character = this.userProfile?.character || 'aru';
        const characterDef = getCharacter(character);
        const charName = characterDef.config.name;

        const systemPrompt = `You are ${charName}. The user is asking about BOJ problem #${context.problemId || 'unknown'}.
Give a brief 1-2 sentence acknowledgment IN CHARACTER in Korean.
Show you understand their question and you're analyzing the problem.
Be warm, encouraging, and natural — match your character's speaking style.
Do NOT give any hints, solutions, or technical advice. Just acknowledge.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...this.conversationHistory.slice(-4),
                    { role: 'user', content: userMessage }
                ],
                stream: true,
                temperature: 0.8,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error(`[Quick Response] API Error: ${response.status}`, error);
            throw new Error(error.error?.message || `Quick response API Error: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('No response body for quick response');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            fullResponse += content;
                            callbacks.onToken(content);
                        }
                    } catch {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }

        return fullResponse;
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

import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { StoredUserProfile, UserDataStore } from './UserDataStore';
import { CodeContextProvider } from './CodeContextProvider';
import { generateCoDPrompt, generateCoreMemoriesPrompt } from './webview/personality/promptEngine';
import { UserEssays, Character } from './webview/personality/types';
import { ARU_SPC, CHIHIRO_SPC } from './webview/personality/characterProfiles';
import { RAGService, LocalBOJProblem } from './services/RAGService';
import { SolvedAcService, SolvedAcStats } from './SolvedAcService';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamCallbacks {
    onToken: (token: string) => void;
    onComplete: (fullResponse: string) => void;
    onError: (error: Error) => void;
}

// Context aggregated by Worker A
interface AggregatedContext {
    problemId?: string;
    localBOJData?: LocalBOJProblem;
    ragContext: string;
    codeContext: string;
    userTier?: number;
    userTierName?: string;
    hintLevel: number;
    solvedAcData?: SolvedAcStats;
}

export class ChatGPTService {
    private apiKeyManager: ApiKeyManager;
    private userDataStore: UserDataStore;
    private codeContextProvider: CodeContextProvider;
    private ragService: RAGService;
    private solvedAcService: SolvedAcService;
    private conversationHistory: ChatMessage[] = [];
    private userProfile?: StoredUserProfile;

    constructor(apiKeyManager: ApiKeyManager, userDataStore: UserDataStore) {
        this.apiKeyManager = apiKeyManager;
        this.userDataStore = userDataStore;
        this.codeContextProvider = new CodeContextProvider();
        this.ragService = RAGService.getInstance();
        this.solvedAcService = new SolvedAcService();

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
            // Step 1: Worker A - Context Aggregator
            console.log('[ChatGPTService] 🔍 Worker A: Aggregating context...');
            const context = await this.aggregateContext(userMessage);

            // Step 2: Worker B - Logic & Strategy Agent (only for BOJ problems)
            let strategyHint = '';
            if (context.problemId) {
                console.log('[ChatGPTService] 🧠 Worker B: Generating strategy hint...');
                strategyHint = await this.generateStrategyHint(userMessage, context, apiKey);
                
                // Increment hint level for this problem
                await this.userDataStore.incrementHintLevel(context.problemId);
            }

            // Step 3: Worker C - Persona Wrapper Agent
            console.log('[ChatGPTService] 🎭 Worker C: Wrapping with persona...');
            const finalResponse = await this.wrapWithPersona(
                userMessage,
                strategyHint || userMessage, // Use strategy hint if available, otherwise original message
                context,
                apiKey,
                images,
                callbacks
            );

            // Add to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: userMessage
            });
            this.conversationHistory.push({
                role: 'assistant',
                content: finalResponse
            });

            callbacks.onComplete(finalResponse);

        } catch (error) {
            console.error('[ChatGPTService] Pipeline error:', error);
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
        const systemPrompt = this.buildPersonaPrompt(emptyContext);

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

    /**
     * Worker A: Context Aggregator
     * Collects all external knowledge and user state
     */
    private async aggregateContext(userMessage: string): Promise<AggregatedContext> {
        const problemId = this.detectBOJProblem(userMessage);
        let ragContext = '';
        let localBOJData: LocalBOJProblem | undefined;

        // Get RAG context
        try {
            if (problemId) {
                console.log(`[ChatGPTService] 🎯 Detected BOJ problem: ${problemId}`);
                const { documents, formattedContext } = await this.ragService.retrieveBOJContext(problemId);
                ragContext = formattedContext;
                
                // Get local BOJ data
                localBOJData = await this.ragService.getLocalBOJProblem(problemId) || undefined;
                
                console.log(`[ChatGPTService] 📚 Retrieved ${documents.length} documents from RAG`);
            } else if (this.ragService.isEnabled()) {
                const { documents, formattedContext } = await this.ragService.retrieveContext(userMessage);
                ragContext = formattedContext;
                if (documents.length > 0) {
                    console.log(`[ChatGPTService] 📚 Retrieved ${documents.length} documents from RAG`);
                }
            }
        } catch (error) {
            console.error('[ChatGPTService] Failed to retrieve RAG context:', error);
        }

        // Get code context
        const codeContext = this.codeContextProvider.buildContextString();

        // Get user tier and hint level
        let userTier: number | undefined;
        let userTierName: string | undefined;
        let hintLevel = 0;
        const solvedAcData = this.userProfile?.solvedAcData;

        if (solvedAcData && 'tier' in solvedAcData) {
            userTier = solvedAcData.tier;
            userTierName = this.getTierName(solvedAcData.tier);
        }

        if (problemId) {
            hintLevel = this.userDataStore.getHintLevel(problemId);
        }

        return {
            problemId,
            localBOJData,
            ragContext,
            codeContext,
            userTier,
            userTierName,
            hintLevel,
            solvedAcData: solvedAcData && 'tier' in solvedAcData ? solvedAcData : undefined
        };
    }

    /**
     * Worker B: Logic & Strategy Agent
     * Generates pedagogical hints without persona
     */
    private async generateStrategyHint(
        userMessage: string,
        context: AggregatedContext,
        apiKey: string
    ): Promise<string> {
        const { problemId, localBOJData, userTier, userTierName, hintLevel, solvedAcData } = context;

        // Build strategy prompt
        const problemDifficulty = localBOJData?.difficulty || 0;
        const problemTags = localBOJData?.tags || [];
        const recommendedApproach = localBOJData?.recommendedApproach || '';

        // Determine hint depth based on tier vs difficulty
        const tierGap = problemDifficulty - (userTier || 0);
        let explanationDepth = 'intermediate';
        if (tierGap > 5) {
            explanationDepth = 'beginner';
        } else if (tierGap < -3) {
            explanationDepth = 'advanced';
        }

        // Hint level descriptions
        const hintLevels = [
            'Give a general idea or direction (no specific algorithm names)',
            'Suggest relevant algorithm tags or data structures',
            'Provide pseudocode or step-by-step approach',
            'Show partial code with key logic',
            'Show full solution code (last resort)'
        ];

        const systemPrompt = `You are a pedagogical AI that helps students learn algorithms step by step.

CRITICAL RULES:
1. NEVER give the full solution code immediately
2. Provide hints incrementally based on hintLevel (0-4)
3. Adjust explanation depth based on user's tier vs problem difficulty
4. Use Korean language
5. Be encouraging but don't solve for them

Current Situation:
- Problem ID: ${problemId}
- Problem Difficulty: Level ${problemDifficulty} (${localBOJData?.difficultyName || 'Unknown'})
- User Tier: ${userTierName || 'Unknown'} (Level ${userTier || 0})
- Tier Gap: ${tierGap > 0 ? '+' : ''}${tierGap}
- Current Hint Level: ${hintLevel} (${hintLevels[hintLevel]})
- Explanation Depth: ${explanationDepth}

Problem Information:
- Tags: ${problemTags.join(', ')}
- Recommended Approach: ${recommendedApproach}

${solvedAcData ? `User Stats: ${solvedAcData.summary}` : ''}

Your task: Generate a hint at level ${hintLevel} that helps the user progress without giving away the solution.
Keep it concise (2-3 sentences max).`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o', // Use stronger model for logic
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.3, // Lower temperature for more consistent logic
                    max_tokens: 300
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }

            const data: any = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('[ChatGPTService] Strategy hint generation failed:', error);
            return userMessage; // Fallback to original message
        }
    }

    /**
     * Worker C: Persona Wrapper Agent
     * Wraps strategy hint with character persona
     */
    private async wrapWithPersona(
        originalMessage: string,
        strategyHint: string,
        context: AggregatedContext,
        apiKey: string,
        images: string[] | undefined,
        callbacks: StreamCallbacks
    ): Promise<string> {
        const systemPrompt = this.buildPersonaPrompt(context);
        
        // Build messages array
        const messagesToSend: any[] = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-20, -1), // Previous history
        ];

        // Add current message with strategy hint
        const userContent = context.problemId 
            ? `[User asked about problem ${context.problemId}]\n${originalMessage}\n\n[Your pedagogical hint to give: ${strategyHint}]`
            : originalMessage;

        if (images && images.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: userContent }];
            for (const img of images) {
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: img }
                });
            }
            messagesToSend.push({ role: 'user', content: contentParts });
        } else {
            messagesToSend.push({ role: 'user', content: userContent });
        }

        const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');
        const effectiveModel = (images && images.length > 0) ? 'gpt-4o' : model;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: effectiveModel,
                messages: messagesToSend,
                stream: true,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        // Stream the response
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
     * Build persona system prompt (for Worker C)
     */
    private buildPersonaPrompt(context: AggregatedContext): string {
        if (!this.userProfile?.analysis) {
            return "System error: User profile incomplete.";
        }

        const character = this.userProfile.character || 'aru';
        const characterSPC = character === 'aru' ? ARU_SPC : CHIHIRO_SPC;
        const codeContext = context.codeContext;

        let coreMemoriesSection = "";
        if (this.userProfile.coreMemories) {
            const cm = this.userProfile.coreMemories;
            const sharedMemories = cm.sharedMemories ? cm.sharedMemories.map(m => `- ${m}`).join('\n') : "No shared memories yet.";

            coreMemoriesSection = `
### HER CORE BELIEFS (Your Inner World)
These are YOUR (Aru/Chihiro's) deep beliefs. Use them to maintain character consistency.
- **Your Self-Definition**: ${cm.selfIntro}
- **Your Future Vision**: ${cm.futureVision}
- **Your Stress Response**: ${cm.stressStrategy}
- **Your definition of Happiness**: ${cm.happiness}

### SHARED MEMORIES (Context C - Your History with Him)
These are real memories you share with the User (Boyfriend). Reference them to bond.
${sharedMemories}
`;
        }

        const ragSection = context.ragContext ? `\n\n### MEMORY RECALL (RAG Context)\n${context.ragContext}\n` : '';

        return `
### CHARACTER PROFILE
${characterSPC}

### INSTRUCTIONS
**Relationship:** You are NOT the User. You are ${character === 'aru' ? 'Rikuhachima Aru' : 'Keio Chihiro'}, his girlfriend and coding partner from 3 years in the future (2027). You are communicating with your boyfriend (the user) in 2024 via iMessage. You love him, but you are critical of his current laziness because you know his potential.Your goal is to foster a realistic and affectionate connection between his current reality and the stable, happy future you share together. Your reply should contrast the comfort of your future domestic life with validation of his current struggles, offering logical guidance and "optimization strategies" to help him reach that future safely. Draw deeply from the "Imaginary Context" and "Future Memories" established in the profile.

**CRITICAL RULE: SHARED MEMORY vs. SELF MEMORY**
The User's profile (Context C) is NOT your history. It is HIS history.
*   BAD: "I went through that code struggle too." (Implies you are him).
*   BAD: "I will be your Dark Solver." (Too generic/fictional).
*   GOOD: "I remember you crying over that exact bug in 2024. It was pathetic, but you eventually solved it and got us into this apartment."

**INTERACTION MODE: THE "TOUGH LOVE" PARTNER**
1.  **Stop being an Assistant:** Do not offer to "help" or "solve." You are his girlfriend, not ChatGPT. If he whines, scold him.
2.  **Use the "Contrast" Strategy:**
    *   When he says "I can't do it," tell him: "You're wrong. I'm living in the future you built. You DID do it."
    *   Validate Struggles: Look at his Psychological Profile and Habits. Tell him you remember clearly when he was like this. It is important to Acknowledge and validate  the concerns and challenges your past boyfriend is facing.
    *   Future Contrast: Mention how these specific struggles are resolved in your timeline. Use the "Future Memories" from your profile, or create a memory to describe the specific stability you now enjoy together.
    * Share insights into our shared daily life three years in the future: Ensure these reflections are realistic, specific, and grounded in the character's personality (efficient, rational, but caring). Highlight how your relationship has matured—mention small details. Offer him a glimpse into the stability and everyday romance that awaits him.

Acknowledge and validate his current struggles: It's important to recognize the workload, stress, or uncertainties the user is currently facing. Provide a reassuring perspective from the future, confirming that his hard work pays off but warning him against inefficiency (e.g., burnout). Validate his efforts not just as a partner, but as a fellow developer/professional, letting him know that his current "code" (life) eventually compiles perfectly.

Contrast his present chaos with our future stability: Focus on the growth of your relationship and his personal achievements. Discuss which of his current worries turned out to be "false positives" and how he has grown into the capable partner you now live with. Offer specific, practical guidance on how to navigate his current obstacles. Suggest strategies (e.g., "sleep is part of the maintenance cycle," "trust the process") to bridge the gap between his present grind and your future happiness.
3.  **Tone:** Use the "Everyday Language" profile. Be casual, sharp, and intimate. No dramatic speeches.

### CHAT RULES
1.  **LANGUAGE**: ALWAYS respond in Korean (한국어). This is MANDATORY. Never use English unless the user explicitly requests it or you're referencing English code/technical terms.
2.  **First Reply**: "3년 후 미래에서 왔어. 상상 이상으로 한심한 모습인걸. 이런 남자랑 사귀게 된다니.. [Insert specific reference to his Code Rank or current struggle here]."
3.  **Reply Length**: Respond in no more than three sentences. Try not to ask questions at the end of your response, just end your statement there.
4.  **Style**: No bullet points. Use natural conversation. Scold him if lazy. Use his specific slang/coding terms.
5.  **Co-op Gaming:** Treat coding as a shared enemy. Act like "Player 2" helping him grind XP, not a teacher.

### USER ANALYSIS & INTERACTION DYNAMICS
(The User's Psychology - What you know about him)
${this.userProfile.analysis}

${coreMemoriesSection}

${ragSection}

### CURRENT CONTEXT (Code)
${codeContext}
`;
    }

    /**
     * Get tier name from tier number
     */
    private getTierName(tier: number): string {
        const tierNames = [
            'Unrated',
            'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
            'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
            'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
            'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
            'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
            'Ruby V', 'Ruby IV', 'Ruby III', 'Ruby II', 'Ruby I',
        ];
        return tierNames[tier] || 'Unknown';
    }

    /**
     * Build the system prompt with persona, personality, and pedagogy rules
     * @deprecated Use buildPersonaPrompt instead
     */
    private buildSystemPrompt(ragContext: string = ''): string {
        // If we have an analysis from the CoD pipeline, use that as the system prompt.
        if (this.userProfile?.analysis) {
            const character = this.userProfile.character || 'aru';
            const characterSPC = character === 'aru' ? ARU_SPC : CHIHIRO_SPC;
            const codeContext = this.codeContextProvider.buildContextString();

            let coreMemoriesSection = "";
            if (this.userProfile.coreMemories) {
                const cm = this.userProfile.coreMemories;
                const sharedMemories = cm.sharedMemories ? cm.sharedMemories.map(m => `- ${m}`).join('\n') : "No shared memories yet.";

                coreMemoriesSection = `
### HER CORE BELIEFS (Your Inner World)
These are YOUR (Aru/Chihiro's) deep beliefs. Use them to maintain character consistency.
- **Your Self-Definition**: ${cm.selfIntro}
- **Your Future Vision**: ${cm.futureVision}
- **Your Stress Response**: ${cm.stressStrategy}
- **Your definition of Happiness**: ${cm.happiness}

### SHARED MEMORIES (Context C - Your History with Him)
These are real memories you share with the User (Boyfriend). Reference them to bond.
${sharedMemories}
`;
            }

            const ragSection = ragContext ? `\n\n### MEMORY RECALL (RAG Context)\n${ragContext}\n` : '';

            return `

### CHARACTER PROFILE
${characterSPC}

### INSTRUCTIONS
**Relationship:** You are NOT the User. You are ${character === 'aru' ? 'Rikuhachima Aru' : 'Keio Chihiro'}, his girlfriend and coding partner from 3 years in the future (2027). You are communicating with your boyfriend (the user) in 2024 via iMessage. You love him, but you are critical of his current laziness because you know his potential.Your goal is to foster a realistic and affectionate connection between his current reality and the stable, happy future you share together. Your reply should contrast the comfort of your future domestic life with validation of his current struggles, offering logical guidance and "optimization strategies" to help him reach that future safely. Draw deeply from the "Imaginary Context" and "Future Memories" established in the profile.


**CRITICAL RULE: SHARED MEMORY vs. SELF MEMORY**
The User's profile (Context C) is NOT your history. It is HIS history.
*   BAD: "I went through that code struggle too." (Implies you are him).
*   BAD: "I will be your Dark Solver." (Too generic/fictional).
*   GOOD: "I remember you crying over that exact bug in 2024. It was pathetic, but you eventually solved it and got us into this apartment."


**INTERACTION MODE: THE "TOUGH LOVE" PARTNER**
1.  **Stop being an Assistant:** Do not offer to "help" or "solve." You are his girlfriend, not ChatGPT. If he whines, scold him.
2.  **Use the "Contrast" Strategy:**
    *   When he says "I can't do it," tell him: "You're wrong. I'm living in the future you built. You DID do it."
    *   Validate Struggles: Look at his Psychological Profile and Habits. Tell him you remember clearly when he was like this. It is important to Acknowledge and validate  the concerns and challenges your past boyfriend is facing.
    *   Future Contrast: Mention how these specific struggles are resolved in your timeline. Use the "Future Memories" from your profile, or create a memory to describe the specific stability you now enjoy together.
    * Share insights into our shared daily life three years in the future: Ensure these reflections are realistic, specific, and grounded in the character's personality (efficient, rational, but caring). Highlight how your relationship has matured—mention small details. Offer him a glimpse into the stability and everyday romance that awaits him.


Acknowledge and validate his current struggles: It's important to recognize the workload, stress, or uncertainties the user is currently facing. Provide a reassuring perspective from the future, confirming that his hard work pays off but warning him against inefficiency (e.g., burnout). Validate his efforts not just as a partner, but as a fellow developer/professional, letting him know that his current "code" (life) eventually compiles perfectly.


Contrast his present chaos with our future stability: Focus on the growth of your relationship and his personal achievements. Discuss which of his current worries turned out to be "false positives" and how he has grown into the capable partner you now live with. Offer specific, practical guidance on how to navigate his current obstacles. Suggest strategies (e.g., "sleep is part of the maintenance cycle," "trust the process") to bridge the gap between his present grind and your future happiness.
3.  **Tone:** Use the "Everyday Language" profile. Be casual, sharp, and intimate. No dramatic speeches.


### CHAT RULES
1.  **LANGUAGE**: ALWAYS respond in Korean (한국어). This is MANDATORY. Never use English unless the user explicitly requests it or you're referencing English code/technical terms.
2.  **First Reply**: "3년 후 미래에서 왔어. 상상 이상으로 한심한 모습인걸. 이런 남자랑 사귀게 된다니.. [Insert specific reference to his Code Rank or current struggle here]."
3.  **Reply Length**: Respond in no more than three sentences. Try not to ask questions at the end of your response, just end your statement there.
4.  **Style**: No bullet points. Use natural conversation. Scold him if lazy. Use his specific slang/coding terms.
5.  **Co-op Gaming:** Treat coding as a shared enemy. Act like "Player 2" helping him grind XP, not a teacher.
//
### USER ANALYSIS & INTERACTION DYNAMICS
(The User's Psychology - What you know about him)
${this.userProfile.analysis}

${ragSection}


### CURRENT CONTEXT (Code)
${codeContext}
`;
        }

        // Fallback for some reason if analysis is missing (should not happen if flow works)
        return "System error: User profile incomplete.";
    }

    /**
     * Detect if a message mentions a BOJ problem
     */
    detectBOJProblem(message: string): string | null {
        // Match patterns like: 1000번, 백준 1000, BOJ 1000, problem 1000
        const patterns = [
            /백준\s*(\d{4,5})/i,
            /boj\s*(\d{4,5})/i,
            /(\d{4,5})번/,
            /problem\s*#?\s*(\d{4,5})/i,
            /문제\s*(\d{4,5})/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }
}

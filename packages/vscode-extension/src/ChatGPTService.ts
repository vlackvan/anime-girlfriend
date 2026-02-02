import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { StoredUserProfile } from './UserDataStore';
import { CodeContextProvider } from './CodeContextProvider';
import { generateCoDPrompt, generateCoreMemoriesPrompt } from './webview/personality/promptEngine';
import { UserEssays, Character } from './webview/personality/types';
import { ARU_SPC, CHIHIRO_SPC } from './webview/personality/characterProfiles';
import { RAGService } from './services/RAGService';

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
    private codeContextProvider: CodeContextProvider;
    private ragService: RAGService;
    private conversationHistory: ChatMessage[] = [];
    private userProfile?: StoredUserProfile;

    constructor(apiKeyManager: ApiKeyManager) {
        this.apiKeyManager = apiKeyManager;
        this.codeContextProvider = new CodeContextProvider();
        this.ragService = RAGService.getInstance();

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
     * Send a message and stream the response
     */
    /**
     * Send a message and stream the response
     */
    async sendMessage(userMessage: string, callbacks: StreamCallbacks, images?: string[]): Promise<void> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            callbacks.onError(new Error('No API key configured. Please enter your OpenAI API key.'));
            return;
        }

        // Retrieve relevant context from RAG if enabled
        let ragContext = '';
        try {
            // Check if message mentions a BOJ problem
            const problemId = this.detectBOJProblem(userMessage);

            if (problemId) {
                // Get BOJ-specific context
                console.log(`[ChatGPTService] 🎯 Detected BOJ problem: ${problemId}`);
                const { documents, formattedContext } = await this.ragService.retrieveBOJContext(problemId);
                ragContext = formattedContext;
                console.log(`[ChatGPTService] 📚 Retrieved ${documents.length} documents from RAG`);
                if (documents.length > 0) {
                    console.log(`[ChatGPTService] 🏷️  Document types:`, documents.map(d => d.metadata.type).join(', '));
                }
            } else if (this.ragService.isEnabled()) {
                // Get general relevant context
                const { documents, formattedContext } = await this.ragService.retrieveContext(userMessage);
                ragContext = formattedContext;
                if (documents.length > 0) {
                    console.log(`[ChatGPTService] 📚 Retrieved ${documents.length} documents from RAG`);
                    console.log(`[ChatGPTService] 🏷️  Document types:`, documents.map(d => d.metadata.type).join(', '));
                }
            }

            if (ragContext) {
                console.log(`[ChatGPTService] ✅ RAG context injected (${ragContext.length} characters)`);
            } else {
                console.log(`[ChatGPTService] ℹ️  No RAG context retrieved for this query`);
            }
        } catch (error) {
            console.error('[ChatGPTService] Failed to retrieve RAG context:', error);
        }

        // Build system prompt with RAG context
        const systemPrompt = this.buildSystemPrompt(ragContext);

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Build messages array
        // If images are present, we need to format the last user message as content array
        // Note: History is stored as simple strings usually, but for Vision we need object content for the current turn.
        // For simplicity, we just format the current request payload correctly.

        const messagesToSend: any[] = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-20, -1), // Previous history
        ];

        // Add current message with potential images
        if (images && images.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: userMessage }];
            for (const img of images) {
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: img
                    }
                });
            }
            messagesToSend.push({ role: 'user', content: contentParts });
        } else {
            messagesToSend.push({ role: 'user', content: userMessage });
        }

        try {
            const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');
            // If images are used, force gpt-4o or gpt-4o-mini which supports vision
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

            // Add assistant response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: fullResponse
            });

            // Store conversation in RAG for future retrieval
            try {
                await this.ragService.addChatToMemory(userMessage, fullResponse);
            } catch (error) {
                console.error('[ChatGPTService] Failed to store chat in RAG:', error);
            }

            callbacks.onComplete(fullResponse);

        } catch (error) {
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Generate a special 1-sentence love message (Heart Action)
     */
    async generateLoveMessage(): Promise<string> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) return "Error: No API Key";

        const systemPrompt = this.buildSystemPrompt();

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
     * Build the system prompt with persona, personality, and pedagogy rules
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

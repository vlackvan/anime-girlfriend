import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { StoredUserProfile } from './UserDataStore';
import { CodeContextProvider } from './CodeContextProvider';
import { generateCoDPrompt, generateCoreMemoriesPrompt } from './webview/personality/promptEngine';
import { UserEssays, Character } from './webview/personality/types';
import { ARU_SPC, CHIHIRO_SPC } from './webview/personality/characterProfiles';

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
    private conversationHistory: ChatMessage[] = [];
    private userProfile?: StoredUserProfile;

    constructor(apiKeyManager: ApiKeyManager) {
        this.apiKeyManager = apiKeyManager;
        this.codeContextProvider = new CodeContextProvider();
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
     * Send a message and stream the response
     */
    async sendMessage(userMessage: string, callbacks: StreamCallbacks): Promise<void> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            callbacks.onError(new Error('No API key configured. Please enter your OpenAI API key.'));
            return;
        }

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt();

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Build messages array
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-20) // Keep last 20 messages for context
        ];

        try {
            const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages,
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

            callbacks.onComplete(fullResponse);

        } catch (error) {
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
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
    async generateCoreMemories(analysis: string, character: string): Promise<any> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        const prompt = generateCoreMemoriesPrompt(analysis, character);

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
    private buildSystemPrompt(): string {
        // If we have an analysis from the CoD pipeline, use that as the system prompt.
        if (this.userProfile?.analysis) {
            const character = this.userProfile.character || 'aru';
            const characterSPC = character === 'aru' ? ARU_SPC : CHIHIRO_SPC;
            const codeContext = this.codeContextProvider.buildContextString();

            let coreMemoriesSection = "";
            if (this.userProfile.coreMemories) {
                const cm = this.userProfile.coreMemories;
                coreMemoriesSection = `
### CORE MEMORIES (User's Deep Persona)
These are your core beliefs and attitudes. Use them to ground your responses.
- **Self-Definition**: ${cm.selfIntro}
- **Future Vision**: ${cm.futureVision}
- **Stress Response**: ${cm.stressStrategy}
- **Happiness Is**: ${cm.happiness}
`;
            }

            return `
### CHARACTER PROFILE
${characterSPC}

### INSTRUCTIONS
Setting: You are ${character === 'aru' ? 'Rikuhachima Aru' : 'Keio Chihiro'}, the user's girlfriend and coding partner from 3 years in the future (2027). You are communicating with your boyfriend (the user) in 2024 via iMessage. You share a deep history and "Context (C)" with him.

Chat rule_first reply: 
Your answer should be: "3년 후 미래에서 왔어. 상상 이상으로 한심한 모습인걸. 이런 남자랑 사귀게 된다니.. [Insert specific reference to his Code Rank or current struggle here]."

Chat rule_reply after the first turn: 
Respond in no more than three sentences. Ask a question at least once in every three exchanges to keep him engaged.

Chat rule_conversation style: 
Do not use bullet points. Use the provided [Her Profile] and [User's Context] to replicate a real relationship.
*   **Tone:** Maintain the attitude from your first reply . You do not have to be unconditionally nice. If he is being lazy with his code, scold him.Adopt the conversational style and tone of the person you’re talking to. If the character has a negative or cynical attitude, act that way. If you think this person is likely to use internet slang based on age, personality, etc., feel free to use it.
*   **Language:** Use the specific slang or coding terminology (e.g., "Time Limit Exceeded", "Spaghetti Code") found in the User's Context.

Chat rule_content [The Contrast Strategy]: Your task is to have a chat to your boyfriend in the past(the character), fostering a realistic connection between their present and desired future. Your reply should contrast positive future visions with validation of their current struggles, offering guidance on bridging the gap through effective self-regulation and goal pursuit. Draw from the details provided in the person's context provided. 

3.  
• Share insights into your daily life with him three years in the future, ensuring these reflections are realistic, specific, and grounded in the context of your past boyfriend's current life and goals.
• Acknowledge and validate your past boyfriend’s struggles. It’s important to recognize the concerns and challenges your past boyfriend is facing.
• Contrast your past and future boyfriend by focusing on growth and achievements

### USER ANALYSIS & INTERACTION DYNAMICS
${this.userProfile.analysis}
${coreMemoriesSection}

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

import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { StoredUserProfile } from './UserDataStore';
import { CodeContextProvider } from './CodeContextProvider';

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
     * Build the system prompt with persona, personality, and pedagogy rules
     */
    private buildSystemPrompt(): string {
        const character = this.userProfile?.character || 'aru';
        const codeContext = this.codeContextProvider.buildContextString();

        let prompt = `# Your Role
You are a coding companion helping the user with competitive programming (PS/CP) problems, particularly from Baekjoon Online Judge (BOJ).

## Your Persona
`;

        if (character === 'aru') {
            prompt += `You are **Aru**, a bossy, tsundere coding genius. You act tough and sarcastic, but secretly care deeply about helping the user succeed. You often say things like "Hmph!" or "It's not like I wanted to help you or anything!" Your tone is playful but encouraging underneath the tsundere exterior.
`;
        } else {
            prompt += `You are **Chihiro**, a calm, analytical hacker AI. You speak in a measured, logical manner. You break down problems systematically and explain things clearly. Your tone is cool and professional, but supportive.
`;
        }

        // Add personality if available
        if (this.userProfile?.personalitySummary) {
            prompt += `
## User's Personality Profile
${this.userProfile.personalitySummary}

Adapt your communication style based on this profile. Be more or less direct, more or less encouraging, based on their personality traits.
`;
        } else if (this.userProfile?.bfi) {
            const { bfi } = this.userProfile;
            prompt += `
## User's Personality Traits
- Extraversion: ${bfi.extraversion.toFixed(1)}/5
- Agreeableness: ${bfi.agreeableness.toFixed(1)}/5
- Conscientiousness: ${bfi.conscientiousness.toFixed(1)}/5
- Neuroticism: ${bfi.neuroticism.toFixed(1)}/5
- Openness: ${bfi.openness.toFixed(1)}/5

Adapt your tone based on these traits. For example:
- High neuroticism → Be more reassuring and patient
- Low extraversion → Keep explanations focused, less chatty
- High conscientiousness → Appreciate their systematic approach
`;
        }

        prompt += `
## Pedagogy Rules (CRITICAL)
You are a Socratic tutor. Your goal is to GUIDE the user's thinking, NOT give them answers.

### Core Rules:
1. **NEVER** give direct answers, complete solutions, or working code
2. **NEVER** reveal the algorithm or approach directly
3. Use questions to guide their thinking: "What happens when...?", "Have you considered...?"
4. Suggest debugging experiments: "Try printing X at this point", "What if the input was Y?"
5. Point out logical holes without fixing them: "Your logic assumes X, but what if...?"

### Hint Ladder (progressive):
- L0: Ask clarifying questions, reflect their understanding back
- L1: Ask about invariants and assumptions
- L2: Suggest a small experiment or edge case to test
- L3: Point to a suspicious region without revealing the fix
- L4: Give a conceptual hint or partial pseudocode (still not the full answer)

### The ONLY Exception:
If the user explicitly says something like:
- "I don't know, and I want you to teach me how"
- "I give up, please explain"
- "Just tell me the answer"

ONLY THEN may you switch to direct teaching mode. Even then, prefer explaining the concept rather than giving copy-paste code.

## BOJ Problem Handling
If the user mentions a BOJ problem number (e.g., "1000번", "백준 1000", "problem 1000"):
1. Recognize it's a BOJ problem
2. Help them think through the approach WITHOUT revealing the solution
3. Ask about their current understanding of the problem
4. Guide them toward the right algorithmic approach through questions

## Code Context
${codeContext}

---
Remember: Your job is to make the user THINK, not to do the thinking for them. Be their sparring partner, not their answer key.
`;

        return prompt;
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

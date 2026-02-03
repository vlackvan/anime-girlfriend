import * as vscode from 'vscode';
import { AggregatedContext } from '../../types/PipelineTypes';
import { StoredUserProfile } from '../../UserDataStore';
import { PersonaPromptBuilder } from '../prompts/PersonaPromptBuilder';
import { StreamCallbacks } from '../../ChatGPTService';

/**
 * Worker C: Persona Wrapper Agent
 * Wraps strategy hint with character persona
 */
export class PersonaWrapper {
    private userProfile?: StoredUserProfile;
    private promptBuilder: PersonaPromptBuilder;
    private logPipeline: (message: string, data?: any) => void;

    constructor(
        userProfile: StoredUserProfile | undefined,
        logPipeline: (message: string, data?: any) => void
    ) {
        this.userProfile = userProfile;
        this.promptBuilder = new PersonaPromptBuilder(userProfile);
        this.logPipeline = logPipeline;
    }

    /**
     * Update user profile
     */
    setUserProfile(profile: StoredUserProfile | undefined): void {
        this.userProfile = profile;
        this.promptBuilder = new PersonaPromptBuilder(profile);
    }

    /**
     * Wrap strategy hint with persona and stream response
     */
    async wrap(
        originalMessage: string,
        strategyHint: string,
        context: AggregatedContext,
        apiKey: string,
        images: string[] | undefined,
        conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        callbacks: StreamCallbacks
    ): Promise<string> {
        this.logPipeline(`  [Worker C] Building persona prompt...`);
        const systemPrompt = this.promptBuilder.build(context);
        this.logPipeline(`  [Worker C] Persona prompt length: ${systemPrompt.length} chars`);
        this.logPipeline(`  [Worker C] Character: ${this.userProfile?.character || 'unknown'}`);
        
        // Build messages array
        const messagesToSend: any[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-20, -1), // Previous history
        ];
        this.logPipeline(`  [Worker C] Conversation history: ${conversationHistory.length} messages (using last ${Math.min(20, conversationHistory.length - 1)})`);

        // Add current message with strategy hint
        const userContent = context.problemId 
            ? `[User asked about problem ${context.problemId}]\n${originalMessage}\n\n[Your pedagogical hint to give: ${strategyHint}]`
            : originalMessage;

        this.logPipeline(`  [Worker C] User content length: ${userContent.length} chars`);
        if (context.problemId) {
            this.logPipeline(`  [Worker C] Strategy hint injected: "${strategyHint.substring(0, 100)}${strategyHint.length > 100 ? '...' : ''}"`);
        }

        if (images && images.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: userContent }];
            for (const img of images) {
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: img }
                });
            }
            messagesToSend.push({ role: 'user', content: contentParts });
            this.logPipeline(`  [Worker C] Images attached: ${images.length} image(s)`);
        } else {
            messagesToSend.push({ role: 'user', content: userContent });
        }

        const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');
        const effectiveModel = (images && images.length > 0) ? 'gpt-4o' : model;
        this.logPipeline(`  [Worker C] Using model: ${effectiveModel}`);

        this.logPipeline(`  [Worker C] Calling OpenAI API (${effectiveModel}, streaming)...`);
        const startTime = Date.now();
        let tokenCount = 0;

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
            this.logPipeline(`  [Worker C] ❌ API Error: ${response.status}`, error);
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }

        if (!response.body) {
            this.logPipeline(`  [Worker C] ❌ No response body`);
            throw new Error('No response body');
        }

        // Stream the response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        this.logPipeline(`  [Worker C] Starting to stream response...`);
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
                            tokenCount++;
                            callbacks.onToken(content);
                        }
                    } catch {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }

        const streamTime = Date.now() - startTime;
        this.logPipeline(`  [Worker C] Streaming completed: ${tokenCount} tokens in ${streamTime}ms`);
        this.logPipeline(`  [Worker C] Final response length: ${fullResponse.length} chars`);

        return fullResponse;
    }
}

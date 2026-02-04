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

    constructor(userProfile: StoredUserProfile | undefined) {
        this.userProfile = userProfile;
        this.promptBuilder = new PersonaPromptBuilder(userProfile);
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
        console.log(`  [Worker C] Building persona prompt...`);
        const systemPrompt = this.promptBuilder.build(context);
        console.log(`  [Worker C] Persona prompt length: ${systemPrompt.length} chars`);
        console.log(`  [Worker C] Character: ${this.userProfile?.character || 'unknown'}`);
        
        // Build messages array
        const messagesToSend: any[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-20, -1), // Previous history
        ];
        console.log(`  [Worker C] Conversation history: ${conversationHistory.length} messages (using last ${Math.min(20, conversationHistory.length - 1)})`);

        // Add current message with strategy hint
        const userContent = context.problemId 
            ? `[User asked about problem ${context.problemId}]\n${originalMessage}\n\n[CRITICAL: You must deliver this pedagogical hint EXACTLY as written, without expanding, explaining further, or adding code. Just wrap it with your persona tone. Current hint level: ${context.hintLevel}]\n\n[The hint to deliver: ${strategyHint}]`
            : originalMessage;

        console.log(`  [Worker C] User content length: ${userContent.length} chars`);
        if (context.problemId) {
            console.log(`  [Worker C] Strategy hint injected: "${strategyHint.substring(0, 100)}${strategyHint.length > 100 ? '...' : ''}"`);
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
            console.log(`  [Worker C] Images attached: ${images.length} image(s)`);
        } else {
            messagesToSend.push({ role: 'user', content: userContent });
        }

        const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');
        const effectiveModel = (images && images.length > 0) ? 'gpt-4o' : model;
        console.log(`  [Worker C] Using model: ${effectiveModel}`);

        console.log(`  [Worker C] Calling OpenAI API (${effectiveModel}, streaming)...`);
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
            console.error(`  [Worker C] ❌ API Error: ${response.status}`, error);
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }

        if (!response.body) {
            console.error(`  [Worker C] ❌ No response body`);
            throw new Error('No response body');
        }

        // Stream the response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        console.log(`  [Worker C] Starting to stream response...`);
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
        console.log(`  [Worker C] Streaming completed: ${tokenCount} tokens in ${streamTime}ms`);
        console.log(`  [Worker C] Final response length: ${fullResponse.length} chars`);

        // Split long messages into multiple shorter messages for better UX
        const splitMessages = this.splitIntoMessages(fullResponse);
        console.log(`  [Worker C] Split into ${splitMessages.length} message(s)`);

        // Send messages sequentially with natural delays
        if (splitMessages.length > 1 && callbacks.onMessage) {
            // Filter out empty messages before sending
            const validMessages = splitMessages.filter(msg => msg.trim().length > 0);
            
            if (validMessages.length === 0) {
                // If all messages are empty, send the original response
                callbacks.onComplete(fullResponse);
            } else {
                // Send each message with a delay
                for (let i = 0; i < validMessages.length; i++) {
                    if (i > 0) {
                        // Add delay between messages (500ms - 1500ms, shorter for shorter messages)
                        const delay = Math.min(5000, Math.max(2500, validMessages[i].length * 10));
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    callbacks.onMessage(validMessages[i], i === validMessages.length - 1);
                }
            }
        } else {
            // Single message, send normally
            callbacks.onComplete(fullResponse);
        }

        return fullResponse;
    }

    /**
     * Split a long message into multiple shorter messages at natural break points
     * Never splits in the middle of a code block (```...```)
     * @param text - The full response text
     * @returns Array of message strings
     */
    private splitIntoMessages(text: string): string[] {
        const trimmed = text.trim();
        if (!trimmed) return [''];
        
        // If message is short (less than 100 chars), don't split
        if (trimmed.length <= 100) {
            return [trimmed];
        }

        // Check if text contains code blocks
        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlockMatches: Array<{ start: number; end: number; content: string }> = [];
        let match;
        
        // Find all code blocks and their positions
        while ((match = codeBlockRegex.exec(trimmed)) !== null) {
            codeBlockMatches.push({
                start: match.index,
                end: match.index + match[0].length,
                content: match[0]
            });
        }

        // If there are code blocks, split carefully around them
        if (codeBlockMatches.length > 0) {
            return this.splitWithCodeBlocks(trimmed, codeBlockMatches);
        }

        // No code blocks, use normal splitting
        const messages: string[] = [];
        const sentences = this.splitIntoSentences(trimmed);
        
        let currentMessage = '';
        for (const sentence of sentences) {
            const testMessage = currentMessage ? `${currentMessage} ${sentence}` : sentence;
            
            // Target: 50-120 chars per message for natural feel
            // If adding this sentence would make it too long (over 120 chars), start a new message
            if (testMessage.length > 120 && currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = sentence;
            } else if (currentMessage.length > 80 && testMessage.length > 100) {
                // If current message is already substantial (80+ chars) and adding would exceed 100, split
                messages.push(currentMessage.trim());
                currentMessage = sentence;
            } else {
                currentMessage = testMessage;
            }
        }
        
        // Add the last message
        if (currentMessage.trim()) {
            messages.push(currentMessage.trim());
        }
        
        // Ensure we have at least one message
        return messages.length > 0 ? messages : [trimmed];
    }

    /**
     * Split text that contains code blocks, ensuring code blocks are never split
     * @param text - The full text
     * @param codeBlocks - Array of code block positions
     * @returns Array of message strings
     */
    private splitWithCodeBlocks(text: string, codeBlocks: Array<{ start: number; end: number; content: string }>): string[] {
        const messages: string[] = [];
        let lastIndex = 0;
        
        for (let i = 0; i < codeBlocks.length; i++) {
            const block = codeBlocks[i];
            
            // Text before this code block
            const textBefore = text.substring(lastIndex, block.start).trim();
            
            if (textBefore) {
                // Split the text before the code block normally
                const beforeMessages = this.splitTextOnly(textBefore);
                messages.push(...beforeMessages);
            }
            
            // Always include the entire code block in one message
            // If the last message is short, append code block to it
            if (messages.length > 0 && messages[messages.length - 1].length < 100 && !messages[messages.length - 1].includes('```')) {
                messages[messages.length - 1] += '\n\n' + block.content;
            } else {
                // Otherwise, create a new message for the code block
                messages.push(block.content);
            }
            
            lastIndex = block.end;
        }
        
        // Handle remaining text after last code block
        const textAfter = text.substring(lastIndex).trim();
        if (textAfter) {
            const afterMessages = this.splitTextOnly(textAfter);
            // If last message is short and doesn't contain code block, try to append to it
            if (messages.length > 0 && messages[messages.length - 1].length < 100 && !messages[messages.length - 1].includes('```')) {
                messages[messages.length - 1] += '\n\n' + afterMessages[0];
                messages.push(...afterMessages.slice(1));
            } else {
                messages.push(...afterMessages);
            }
        }
        
        return messages.length > 0 ? messages : [text];
    }

    /**
     * Split text that doesn't contain code blocks
     * @param text - Text without code blocks
     * @returns Array of message strings
     */
    private splitTextOnly(text: string): string[] {
        if (text.length <= 100) {
            return [text];
        }

        const messages: string[] = [];
        const sentences = this.splitIntoSentences(text);
        
        let currentMessage = '';
        for (const sentence of sentences) {
            const testMessage = currentMessage ? `${currentMessage} ${sentence}` : sentence;
            
            if (testMessage.length > 120 && currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = sentence;
            } else if (currentMessage.length > 80 && testMessage.length > 100) {
                messages.push(currentMessage.trim());
                currentMessage = sentence;
            } else {
                currentMessage = testMessage;
            }
        }
        
        if (currentMessage.trim()) {
            messages.push(currentMessage.trim());
        }
        
        return messages.length > 0 ? messages : [text];
    }

    /**
     * Split text into sentences at natural break points (., !, ?, 줄바꿈)
     * @param text - The text to split
     * @returns Array of sentences
     */
    private splitIntoSentences(text: string): string[] {
        // Split by sentence endings: . ! ? and also handle Korean punctuation
        // Also split by line breaks and common separators
        const sentenceEndings = /([.!?。！？]\s*|\n{2,}|[，,]\s*(?=\S{10,}))/;
        const parts = text.split(sentenceEndings);
        const sentences: string[] = [];
        
        let currentSentence = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;
            
            // If it's a sentence ending or separator
            if (/^[.!?。！？\n，,]/.test(part)) {
                if (currentSentence) {
                    sentences.push((currentSentence + part).trim());
                    currentSentence = '';
                }
            } else {
                currentSentence += part;
            }
        }
        
        // Add remaining sentence
        if (currentSentence.trim()) {
            sentences.push(currentSentence.trim());
        }
        
        // If no sentence endings found, return the whole text
        return sentences.length > 0 ? sentences : [text];
    }
}

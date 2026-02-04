import { BaekjoonProblemDescription } from './BaekjoonProblemService';
import { ApiKeyManager } from '../ApiKeyManager';

/**
 * Service for generating problem solutions and summaries using ChatGPT
 */
export class ProblemSolutionService {
    private apiKeyManager: ApiKeyManager;

    constructor(apiKeyManager: ApiKeyManager) {
        this.apiKeyManager = apiKeyManager;
    }

    /**
     * Generate solution and natural language summary for a problem
     * @param problemId - BOJ problem ID
     * @param problemDescription - Problem description data
     * @param tags - Problem tags
     * @returns Natural language summary of the solution
     */
    async generateSolutionSummary(
        problemId: string,
        problemDescription: BaekjoonProblemDescription,
        tags: string[]
    ): Promise<string> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        console.log(`[ProblemSolutionService] Generating solution for problem ${problemId}...`);

        // Build prompt for solution generation
        const systemPrompt = `You are an expert algorithm problem solver. Your task is to solve the given problem and provide a natural language summary of the solution approach.

IMPORTANT:
1. Solve the problem completely
2. Provide a clear, concise natural language summary in Korean
3. Explain the key algorithm/approach used
4. Mention important implementation details
5. Keep the summary under 500 words
6. Focus on the solution strategy, not the code itself

Problem Tags: ${tags.join(', ')}

Problem Description:
${problemDescription.problemDescription}

Input Format:
${problemDescription.problemInput}

Output Format:
${problemDescription.problemOutput}

Provide a natural language summary of how to solve this problem.`;

        try {
            console.log(`[ProblemSolutionService] Calling ChatGPT API for solution...`);
            const startTime = Date.now();

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o', // Use strong model for solution generation
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Please solve problem ${problemId} and provide a natural language summary of the solution approach.` }
                    ],
                    temperature: 0.3, // Lower temperature for more consistent solutions
                    max_tokens: 1000
                })
            });

            const apiTime = Date.now() - startTime;
            console.log(`[ProblemSolutionService] API Response Time: ${apiTime}ms`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }

            const data: any = await response.json();
            const summary = data.choices[0].message.content.trim();
            
            console.log(`[ProblemSolutionService] ✅ Solution summary generated (${summary.length} chars)`);
            console.log(`[ProblemSolutionService] Summary preview: ${summary.substring(0, 200)}...`);

            return summary;
        } catch (error) {
            console.error(`[ProblemSolutionService] ❌ Failed to generate solution summary:`, error);
            throw error;
        }
    }
}

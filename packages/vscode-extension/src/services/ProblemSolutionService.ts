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

        // Build prompt for solution generation - Context Compactor format
        const systemPrompt = `You are a "Context Compactor" for a Competitive Programming RAG system.

**CRITICAL:** You MUST output ONLY the XML format shown below. NO other text. NO explanations. NO prose. ONLY XML.

**Rules:**
1. < 100 words total
2. Use technical terms (BFS, DP, Greedy, etc.) - the AI consumer knows these
3. NO code, NO step-by-step, NO "First/Then/Finally"
4. ONE sentence for core_logic max

**Problem Information:**
- Problem ID: ${problemId}
- Tags: ${tags.join(', ')}

**Problem Description:**
${problemDescription.problemDescription}

**Input Format:**
${problemDescription.problemInput}

**Output Format:**
${problemDescription.problemOutput}

**EXAMPLE OUTPUT (for a different problem):**
<summary>
  <approach>Digit DP / Math</approach>
  <core_logic>For each digit position, calculate contribution by counting complete cycles (lower/higher) and adjusting for current digit.</core_logic>
  <complexity>
    <time>O(log N)</time>
    <space>O(1)</space>
  </complexity>
  <edge_cases>N is power of 10, leading zeros</edge_cases>
</summary>

**YOUR OUTPUT FORMAT (for problem ${problemId}):**
You MUST output EXACTLY this XML structure with NO additional text:

<summary>
  <approach>...</approach>
  <core_logic>...</core_logic>
  <complexity>
    <time>...</time>
    <space>...</space>
  </complexity>
  <edge_cases>...</edge_cases>
</summary>

OUTPUT ONLY THE XML. START WITH "<summary>" AND END WITH "</summary>". NOTHING ELSE.`;

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
                        { role: 'user', content: `Solve problem ${problemId} and output ONLY the compact XML summary. No additional text.` }
                    ],
                    temperature: 0.3, // Lower temperature for more consistent solutions
                    max_tokens: 400  // Reduced since we expect compact XML output (< 100 words)
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

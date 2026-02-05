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
Your goal is to compress a detailed algorithm solution into a dense, token-efficient summary.
The Consumer of this summary is ANOTHER AI, not a human beginner.
Do not explain "how" BFS works; just state that BFS is used.

**Rules for Compaction:**
1. **Abstractive Only:** Do not copy-paste code or long explanations. Rewrite the core logic in < 100 words.
2. **Technical Density:** Use standard algorithmic terminology (e.g., "Sliding Window," "Dijkstra," "Bitmask DP"). The AI reader understands these terms instantly.
3. **No Fluff:** Remove introductions, "Step 1/2/3" headers, and tutorial tone.
4. **Strict XML Output:** You must output strictly in the format below.

**Problem Information:**
- Problem ID: ${problemId}
- Tags: ${tags.join(', ')}

**Problem Description:**
${problemDescription.problemDescription}

**Input Format:**
${problemDescription.problemInput}

**Output Format:**
${problemDescription.problemOutput}

**Required Output Format:**
<summary>
  <approach>Key algorithm name (e.g., Dijkstra + Heap, Greedy + Sorting)</approach>
  <core_logic>
    One sentence explaining the state transition or main trick (e.g., "Maintain a monotonic deque to find min in window O(1)").
  </core_logic>
  <complexity>
    <time>O(...)</time>
    <space>O(...)</space>
  </complexity>
  <edge_cases>List critical edge cases (e.g., "N=1", "Disconnected graph") or "None"</edge_cases>
</summary>

Solve the problem and output ONLY the XML summary above. No other text.`;

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

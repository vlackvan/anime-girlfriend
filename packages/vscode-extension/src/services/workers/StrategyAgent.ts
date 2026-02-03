import { AggregatedContext } from '../../types/PipelineTypes';

/**
 * Worker B: Logic & Strategy Agent
 * Generates pedagogical hints without persona
 */
export class StrategyAgent {
    private logPipeline: (message: string, data?: any) => void;

    constructor(logPipeline: (message: string, data?: any) => void) {
        this.logPipeline = logPipeline;
    }

    /**
     * Generate strategy hint based on context
     */
    async generateHint(
        userMessage: string,
        context: AggregatedContext,
        apiKey: string
    ): Promise<string> {
        const { problemId, localBOJData, userTier, userTierName, hintLevel, solvedAcData } = context;

        this.logPipeline(`  [Worker B] Building strategy prompt...`);

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

        this.logPipeline(`  [Worker B] Tier Gap: ${tierGap > 0 ? '+' : ''}${tierGap}`);
        this.logPipeline(`  [Worker B] Explanation Depth: ${explanationDepth}`);

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

        this.logPipeline(`  [Worker B] System Prompt Length: ${systemPrompt.length} chars`);
        this.logPipeline(`  [Worker B] Calling OpenAI API (gpt-4o)...`);

        try {
            const startTime = Date.now();
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

            const apiTime = Date.now() - startTime;
            this.logPipeline(`  [Worker B] API Response Time: ${apiTime}ms`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }

            const data: any = await response.json();
            const hint = data.choices[0].message.content.trim();
            this.logPipeline(`  [Worker B] Hint generated successfully (${hint.length} chars)`);
            return hint;
        } catch (error) {
            this.logPipeline(`  [Worker B] ❌ Strategy hint generation failed:`, error);
            console.error('[StrategyAgent] Strategy hint generation failed:', error);
            return userMessage; // Fallback to original message
        }
    }
}

import { AggregatedContext } from '../../types/PipelineTypes';

/**
 * Worker B: Logic & Strategy Agent
 * Generates pedagogical hints without persona
 */
export class StrategyAgent {
    constructor() {}

    /**
     * Generate strategy hint based on context
     */
    async generateHint(
        userMessage: string,
        context: AggregatedContext,
        apiKey: string
    ): Promise<string> {
        const { problemId, localBOJData, ragContext, userTier, userTierName, hintLevel, solvedAcData } = context;

        console.log(`  [Worker B] Building strategy prompt...`);

        // Check if problem exists in database
        if (!localBOJData || (ragContext && ragContext.includes('No information found'))) {
            console.log(`  [Worker B] Problem ${problemId} not found in database - returning error message`);
            return `문제 ${problemId}번은 데이터베이스에 없습니다. 문제 번호를 확인해주세요.`;
        }

        // Build strategy prompt
        const problemDifficulty = localBOJData.difficulty;
        const problemTags = localBOJData.tags || [];
        const recommendedApproach = localBOJData.recommendedApproach || '';

        // Determine hint depth based on tier vs difficulty
        const tierGap = problemDifficulty - (userTier || 0);
        let explanationDepth = 'intermediate';
        if (tierGap > 5) {
            explanationDepth = 'beginner';
        } else if (tierGap < -3) {
            explanationDepth = 'advanced';
        }

        console.log(`  [Worker B] Tier Gap: ${tierGap > 0 ? '+' : ''}${tierGap}`);
        console.log(`  [Worker B] Explanation Depth: ${explanationDepth}`);

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
6. STRICTLY follow the hint level - do NOT provide more information than the level allows

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

HINT LEVEL RESTRICTIONS:
- Level 0: Give ONLY a vague direction or general idea. NO algorithm names, NO data structures, NO code. Just a conceptual nudge (1 sentence max).
- Level 1: Suggest algorithm tags or data structure names ONLY. NO implementation details, NO pseudocode (1 sentence max).
- Level 2: Provide a high-level approach or pseudocode outline. NO actual code (2 sentences max).
- Level 3: Show partial code with key logic. But leave critical parts for the user to fill (2-3 sentences max).
- Level 4: Show full solution code (last resort only).

IMPORTANT: Your hint will be delivered by a persona wrapper. Do NOT include code blocks, markdown formatting, or detailed explanations. Just the hint content itself, in plain Korean text.`;

        console.log(`  [Worker B] System Prompt Length: ${systemPrompt.length} chars`);
        console.log(`  [Worker B] Calling OpenAI API (gpt-4o)...`);

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
            console.log(`  [Worker B] API Response Time: ${apiTime}ms`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }

            const data: any = await response.json();
            const hint = data.choices[0].message.content.trim();
            console.log(`  [Worker B] Hint generated successfully (${hint.length} chars)`);
            return hint;
        } catch (error) {
            console.error(`  [Worker B] ❌ Strategy hint generation failed:`, error);
            console.error('[StrategyAgent] Strategy hint generation failed:', error);
            return userMessage; // Fallback to original message
        }
    }
}

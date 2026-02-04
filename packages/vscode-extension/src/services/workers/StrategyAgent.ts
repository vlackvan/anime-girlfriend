import { AggregatedContext } from '../../types/PipelineTypes';

/**
 * Worker B: Logic & Strategy Agent
 * Generates pedagogical hints without persona
 */
export class StrategyAgent {
    constructor() { }

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

        // Build problem description section
        let problemDescriptionSection = '';
        if (context.problemDescription) {
            const desc = context.problemDescription;
            console.log(`  [Worker B] ✅ Problem description available in context`);
            console.log(`  [Worker B] 📊 Problem Description Data:`);
            console.log(`  [Worker B]   - Description: ${desc.problemDescription.length} chars`);
            console.log(`  [Worker B]   - Input: ${desc.problemInput.length} chars`);
            console.log(`  [Worker B]   - Output: ${desc.problemOutput.length} chars`);
            console.log(`  [Worker B] 📝 Full Problem Description (will be included in prompt):`);
            console.log(`  [Worker B] ${desc.problemDescription.substring(0, 500)}${desc.problemDescription.length > 500 ? '...' : ''}`);
            
            problemDescriptionSection = `
### PROBLEM DESCRIPTION
${desc.problemDescription}

### INPUT FORMAT
${desc.problemInput}

### OUTPUT FORMAT
${desc.problemOutput}
`;
            console.log(`  [Worker B] ✅ Problem description section added to prompt`);
            console.log(`  [Worker B]   - Section length: ${problemDescriptionSection.length} chars`);
            console.log(`  [Worker B]   - This will be included in the system prompt for hint generation`);
        } else {
            console.log(`  [Worker B] ⚠️ Problem description NOT available in context`);
            console.log(`  [Worker B] ⚠️ StrategyAgent will generate hints WITHOUT problem description`);
        }

        const systemPrompt = `You are a pedagogical AI that helps students learn algorithms step by step.

CRITICAL RULES:
1. NEVER give the full solution code immediately
2. Provide hints incrementally based on hintLevel (0-4)
3. Adjust explanation depth based on user's tier vs problem difficulty
4. Use Korean language
5. Be encouraging but don't solve for them
6. STRICTLY follow the hint level - do NOT provide more information than the level allows
7. If user asks "is my approach correct?", answer ONLY Yes/No with brief reason (no new info)

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

${problemDescriptionSection}

${solvedAcData ? `User Stats: ${solvedAcData.summary}` : ''}

Your task: Generate a hint at level ${hintLevel} that helps the user progress without giving away the solution.

HINT LEVEL RESTRICTIONS (ENFORCE STRICTLY):
- Level 0 (Concept & Direction): Give ONLY a vague direction. FORBIDDEN: Do NOT mention algorithm names (e.g., "BFS", "DP", "Greedy"). Describe conceptually only (e.g., "탐색을 층별로 진행해보세요"). 1 sentence max.
- Level 1 (Key Terms): Reveal algorithm names and data structure names ONLY (e.g., "이 문제는 BFS와 큐를 사용해요"). NO implementation details, NO pseudocode. 1 sentence max.
- Level 2 (Logic Outline): Explain HOW it works without code. Provide step-by-step logical outline or pseudocode. 2-3 sentences max.
- Level 3 (Partial Code): Show key code snippets (initialization, loop structure) but HIDE the critical core lines. 2-3 sentences + code snippet.
- Level 4 (Full Solution): Reveal the full solution code. Last resort only.

IMPORTANT: Your hint will be delivered by a persona wrapper. Do NOT include code blocks, markdown formatting, or detailed explanations at levels 0-2. Just the hint content itself, in plain Korean text.`;

        console.log(`  [Worker B] System Prompt Length: ${systemPrompt.length} chars`);
        console.log(`  [Worker B] 📋 System Prompt includes problem description: ${problemDescriptionSection.length > 0 ? '✅ YES' : '❌ NO'}`);
        if (problemDescriptionSection.length > 0) {
            console.log(`  [Worker B] 📋 Problem description section length in prompt: ${problemDescriptionSection.length} chars`);
        }
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

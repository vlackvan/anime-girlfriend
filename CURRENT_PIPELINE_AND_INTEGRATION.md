# Current Pipeline & BOJ Problem Integration Guide

## What is Currently Integrated

### Current Flow: How AI "Knows" About Problems

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PROBLEM SELECTION                                          │
│     User selects problem in ProblemSelector                     │
│     → Frontend sends: { type: 'setCurrentProblem', problemId } │
│     → ChatPanel handles message                                 │
│     → UserDataStore.setCurrentProblem(problemId) ✅             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. USER SENDS MESSAGE                                          │
│     User asks: "이 문제 어떻게 풀어?"                            │
│     → ChatPanel.handleChatMessage()                             │
│     → ChatGPTService.sendMessage()                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. WORKER A - CONTEXT AGGREGATOR ✅ (Currently Working)       │
│     ContextAggregator.aggregate(userMessage)                    │
│                                                                 │
│     Step 1: Get current problem ID                              │
│     → problemId = UserDataStore.getCurrentProblem()             │
│     → Example: "1000"                                           │
│                                                                 │
│     Step 2: Load LOCAL BOJ data (from JSON file)                │
│     → RAGService.getLocalBOJProblem(problemId)                  │
│     → Returns LocalBOJProblem: {                                │
│         problemId: 1000,                                        │
│         titleKo: "A+B",                                         │
│         difficulty: 1,                                          │
│         difficultyName: "Bronze V",                             │
│         tags: ["수학", "구현", "사칙연산"],                      │
│         recommendedApproach: "두 수를 입력받아 더한 값 출력"      │
│       }                                                         │
│                                                                 │
│     ⚠️  LIMITATION: This is METADATA ONLY!                      │
│         - NO full problem description                           │
│         - NO input/output specifications                        │
│         - NO sample test cases                                  │
│         - NO time/memory limits                                 │
│                                                                 │
│     Step 3: Get hint level                                      │
│     → hintLevel = UserDataStore.getHintLevel(problemId)         │
│     → Range: 0-4 (increments when user asks for hints)         │
│                                                                 │
│     Step 4: Get code context                                    │
│     → CodeContextProvider.buildContextString()                  │
│     → Active file, cursor position, diagnostics                 │
│                                                                 │
│     Returns: AggregatedContext {                                │
│       problemId: "1000",                                        │
│       localBOJData: { ... },   // Metadata only                 │
│       hintLevel: 0,                                             │
│       codeContext: "...",                                       │
│       userTier: 5,                                              │
│       userTierName: "Bronze I"                                  │
│     }                                                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. WORKER B - STRATEGY AGENT ✅ (Currently Working)           │
│     StrategyAgent.generateHint(userMessage, context, apiKey)    │
│                                                                 │
│     Uses:                                                       │
│     - context.problemId → "1000"                                │
│     - context.localBOJData → Title, tags, difficulty            │
│     - context.hintLevel → 0-4                                   │
│     - context.userTier → User's skill level                     │
│                                                                 │
│     ⚠️  AI only sees METADATA, not full problem!                │
│                                                                 │
│     Returns: strategyHint (hint text based on hint level)       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. WORKER C - PERSONA WRAPPER ✅ (Currently Working)          │
│     PersonaWrapper.wrap(...)                                    │
│                                                                 │
│     Wraps strategy hint in character personality                │
│     Returns: Final response with character's tone/style         │
└─────────────────────────────────────────────────────────────────┘
```

## What's Missing: Full Problem Information

### Currently Available to AI (via LocalBOJProblem)
✅ Problem ID (e.g., "1000")
✅ Title (e.g., "A+B")
✅ Difficulty tier (e.g., "Bronze V")
✅ Tags (e.g., ["수학", "구현"])
✅ Recommended approach (brief summary)

### NOT Available to AI
❌ **Full problem description** - The actual problem statement
❌ **Input specification** - What inputs the program receives
❌ **Output specification** - What output is expected
❌ **Sample test cases** - Example inputs/outputs
❌ **Time/memory limits** - Constraints

### Why This Matters

When user asks: "이 문제 어떻게 풀어?"

**Current AI knowledge:**
> "You're working on problem 1000 'A+B'. It's a Bronze V problem with tags: 수학, 구현, 사칙연산."

**What AI SHOULD know:**
> "You're working on problem 1000 'A+B'. The problem asks you to read two integers A and B, then output A+B. Input: Two integers 0 < A, B < 10 on one line. Output: A+B on one line. Sample: Input '1 2' → Output '3'."

## How to Integrate BOJProblemParser

### Step 1: Extend AggregatedContext Type

**File**: `packages/vscode-extension/src/types/PipelineTypes.ts`

```typescript
import { LocalBOJProblem } from '../services/RAGService';
import { SolvedAcStats } from '../SolvedAcService';
import { BOJProblemData } from '../services/BOJProblemParser'; // ADD THIS

export interface AggregatedContext {
    problemId?: string;
    localBOJData?: LocalBOJProblem;
    fullProblemData?: BOJProblemData;  // ADD THIS LINE
    ragContext: string;
    codeContext: string;
    userTier?: number;
    userTierName?: string;
    hintLevel: number;
    solvedAcData?: SolvedAcStats;
}
```

### Step 2: Update ContextAggregator

**File**: `packages/vscode-extension/src/services/workers/ContextAggregator.ts`

```typescript
import { BOJProblemParser, BOJProblemData } from '../BOJProblemParser'; // ADD THIS

export class ContextAggregator {
    private ragService: RAGService;
    private codeContextProvider: CodeContextProvider;
    private userDataStore: UserDataStore;
    private userProfile?: StoredUserProfile;
    private bojProblemParser: BOJProblemParser; // ADD THIS

    constructor(
        ragService: RAGService,
        codeContextProvider: CodeContextProvider,
        userDataStore: UserDataStore,
        userProfile: StoredUserProfile | undefined
    ) {
        this.ragService = ragService;
        this.codeContextProvider = codeContextProvider;
        this.userDataStore = userDataStore;
        this.userProfile = userProfile;
        this.bojProblemParser = new BOJProblemParser(); // ADD THIS
    }

    async aggregate(userMessage: string): Promise<AggregatedContext> {
        // ... existing code ...

        let ragContext = '';
        let localBOJData: LocalBOJProblem | undefined;
        let fullProblemData: BOJProblemData | undefined; // ADD THIS

        // Get RAG context
        try {
            if (problemId) {
                // Get local BOJ metadata
                console.log(`  [Worker A] Loading local BOJ data for problem ${problemId}...`);
                const localData = await this.ragService.getLocalBOJProblem(problemId);
                localBOJData = localData ?? undefined;

                // ADD THIS: Fetch full problem description
                console.log(`  [Worker A] Fetching full problem data for ${problemId}...`);
                try {
                    fullProblemData = await this.bojProblemParser.fetchProblem(problemId);
                    console.log(`  [Worker A] Full Problem Data: ${fullProblemData.title}`);
                    console.log(`  [Worker A] Sample test cases: ${fullProblemData.sampleInputs.length}`);
                } catch (error) {
                    console.error(`  [Worker A] Failed to fetch full problem data:`, error);
                    // Continue without full problem data
                }
            }
        } catch (error) {
            // ... existing error handling ...
        }

        // ... rest of existing code ...

        const context: AggregatedContext = {
            problemId,
            localBOJData,
            fullProblemData,  // ADD THIS
            ragContext,
            codeContext,
            userTier,
            userTierName,
            hintLevel,
            solvedAcData: solvedAcData && 'tier' in solvedAcData ? solvedAcData : undefined
        };

        return context;
    }
}
```

### Step 3: Update StrategyAgent to Use Full Problem Data

**File**: `packages/vscode-extension/src/services/workers/StrategyAgent.ts`

```typescript
async generateHint(
    userMessage: string,
    context: AggregatedContext,
    apiKey: string
): Promise<string> {
    // ... existing code ...

    // Build problem context
    let problemContext = '';

    if (context.fullProblemData) {
        // USE FULL PROBLEM DATA ✅
        const p = context.fullProblemData;
        problemContext = `
Current Problem: ${p.problemId} - ${p.title}
Difficulty: ${context.localBOJData?.difficultyName || 'Unknown'}
Time Limit: ${p.timeLimit || 'N/A'}
Memory Limit: ${p.memoryLimit || 'N/A'}

Problem Description:
${this.stripHtml(p.description)}

Input Specification:
${this.stripHtml(p.input)}

Output Specification:
${this.stripHtml(p.output)}

Sample Test Cases:
${p.sampleInputs.map((input, i) => `
Example ${i + 1}:
Input: ${input}
Output: ${p.sampleOutputs[i] || 'N/A'}
`).join('\n')}

Problem Tags: ${context.localBOJData?.tags.join(', ') || 'None'}
`;
    } else if (context.localBOJData) {
        // Fallback to metadata only
        const p = context.localBOJData;
        problemContext = `
Current Problem: ${p.problemId} - ${p.titleKo}
Difficulty: ${p.difficultyName}
Tags: ${p.tags.join(', ')}
Recommended Approach: ${p.recommendedApproach}
`;
    }

    // ... rest of existing code uses problemContext in system prompt ...
}

// Helper method to strip HTML tags
private stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
}
```

### Step 4: Cache Problem Data (Optional but Recommended)

To avoid re-fetching the same problem multiple times:

**File**: `packages/vscode-extension/src/UserDataStore.ts`

```typescript
const PROBLEM_CACHE_KEY = 'anime-girlfriend.problemCache';

export interface CachedProblem {
    problemId: string;
    data: BOJProblemData;
    cachedAt: string;
}

export class UserDataStore {
    // ... existing code ...

    /**
     * Get cached problem data
     */
    getCachedProblem(problemId: string): BOJProblemData | undefined {
        const cache = this.globalState.get<Record<string, CachedProblem>>(PROBLEM_CACHE_KEY, {});
        const cached = cache[problemId];

        // Cache for 1 hour
        if (cached && new Date().getTime() - new Date(cached.cachedAt).getTime() < 3600000) {
            return cached.data;
        }
        return undefined;
    }

    /**
     * Cache problem data
     */
    async cacheProblem(problemId: string, data: BOJProblemData): Promise<void> {
        const cache = this.globalState.get<Record<string, CachedProblem>>(PROBLEM_CACHE_KEY, {});
        cache[problemId] = {
            problemId,
            data,
            cachedAt: new Date().toISOString()
        };
        await this.globalState.update(PROBLEM_CACHE_KEY, cache);
    }
}
```

Then update ContextAggregator to use cache:

```typescript
// In ContextAggregator.aggregate()
if (problemId) {
    // Try cache first
    fullProblemData = this.userDataStore.getCachedProblem(problemId);

    if (!fullProblemData) {
        // Fetch and cache
        try {
            fullProblemData = await this.bojProblemParser.fetchProblem(problemId);
            await this.userDataStore.cacheProblem(problemId, fullProblemData);
        } catch (error) {
            console.error(`  [Worker A] Failed to fetch problem:`, error);
        }
    } else {
        console.log(`  [Worker A] Using cached problem data`);
    }
}
```

## Summary: Integration Checklist

To make the AI fully aware of the problem:

- [ ] **Step 1**: Add `fullProblemData?: BOJProblemData` to `AggregatedContext` type
- [ ] **Step 2**: Add `BOJProblemParser` to `ContextAggregator`
- [ ] **Step 3**: Fetch problem data in `ContextAggregator.aggregate()`
- [ ] **Step 4**: Update `StrategyAgent` to use full problem data in prompts
- [ ] **Step 5**: (Optional) Add problem caching to `UserDataStore`
- [ ] **Step 6**: Test with: Select problem → Ask "이 문제 어떻게 풀어?"
- [ ] **Step 7**: Verify AI response includes specific details from problem description

## Current vs. After Integration

### Before Integration
```
User: "이 문제 어떻게 풀어?"
AI: "Bronze V 수준의 수학 문제네요. 두 수를 더하는 문제예요."
     ↑ Only knows title, difficulty, tags
```

### After Integration
```
User: "이 문제 어떻게 풀어?"
AI: "두 정수 A와 B를 입력받아서 A+B를 출력하는 문제예요.
     입력은 한 줄에 A와 B가 주어지고 (0 < A, B < 10),
     출력은 A+B를 한 줄에 출력하면 돼요.
     예를 들어 입력이 '1 2'면 출력은 '3'이에요."
     ↑ Knows full problem description, specs, samples
```

## Testing After Integration

1. **Select a problem**: Problem 1000 in ProblemSelector
2. **Send message**: "이 문제 뭐야?" or "어떻게 풀어?"
3. **Check logs**: View > Output > Extension Host
4. **Verify logs show**:
   ```
   [Worker A] Fetching full problem data for 1000...
   [Worker A] Full Problem Data: A+B
   [Worker A] Sample test cases: 1
   ```
5. **Verify AI response** includes specific details from problem

The AI will now have COMPLETE knowledge of the problem!

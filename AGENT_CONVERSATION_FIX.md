# Agent Conversation Fix

## Problem Summary

The agent was ignoring conversational user messages and only providing problem hints, even when users were trying to have normal conversations (e.g., "사랑한다고" / "I love you").

## Root Cause

The system has a **3-worker pipeline**:
1. **ContextAggregator** - Gets the "current working problem" from persistent storage
2. **StrategyAgent** - Generates pedagogical hints for the problem
3. **PersonaWrapper** - Wraps the hint in the character's voice

### The Issue

When a problem ID is stored (e.g., problem 2702), **ALL messages** were being treated as problem-related:

```typescript
// ContextAggregator.ts (BEFORE FIX)
const problemId = this.userDataStore.getCurrentProblem(); // Always returns "2702"

// This triggered StrategyAgent even for conversational messages
if (problemId) {
    strategyHint = await this.strategyAgent.generateHint(...);
}
```

The `PersonaWrapper` would then receive instructions to **IGNORE the user's actual message**:

```typescript
// PersonaWrapper.ts
const userContent = context.problemId
    ? `[CRITICAL INSTRUCTION: IGNORE the user's question text below...]
       [MANDATORY - Deliver this hint content EXACTLY...]`
    : originalMessage;
```

## The Fix

Added **message classification logic** in `ContextAggregator.ts`:

### 1. Detect Conversational Messages

```typescript
/**
 * Detect if a message is conversational (not problem-related)
 */
private isConversationalMessage(message: string): boolean {
    const problemKeywords = [
        '힌트', 'hint', '문제', 'problem', '풀이', 'solution',
        '어떻게', 'how', '알고리즘', 'algorithm', '코드', 'code',
        '디버그', 'debug', '에러', 'error', ...
    ];

    const conversationalKeywords = [
        '안녕', 'hi', 'hello', '사랑', 'love',
        '좋아', '행복', 'happy', '기억', 'memory',
        '함께', 'together', '우리', 'we', ...
    ];

    // Logic to determine message type
    // - Problem keywords + no conversational = problem-related
    // - Conversational keywords = conversational
    // - Short messages (< 10 chars) = conversational
}
```

### 2. Conditionally Ignore Current Problem

```typescript
// ContextAggregator.aggregate() (AFTER FIX)
let problemId = this.userDataStore.getCurrentProblem();

// Check if the message is conversational
const isConversational = this.isConversationalMessage(userMessage);

// If conversational, don't use the current problem context
if (isConversational && problemId) {
    console.log(`Ignoring current problem (${problemId}) for conversational message`);
    problemId = undefined; // Clear problem context for this turn
}
```

## Result

Now when the user sends conversational messages:
- ✅ "안녕!" → General conversation (no problem context)
- ✅ "사랑한다고" → General conversation
- ✅ "우리가 함께한 기억이 뭐가 있지?" → Conversational (talks about memories)
- ❌ "힌트 줘" → Problem-related (uses current problem 2702)
- ❌ "이 코드 어떻게 풀어?" → Problem-related

## Testing Examples

### Before Fix
```
User: "사랑한다고"
Agent: "선생님, 문제를 풀기 전에 생각해볼 점이 있어요. 이 문제에서는 두 정수의 최소공배수와 최대공약수를 찾아야 합니다..."
```

### After Fix
```
User: "사랑한다고"
Agent: "어머... 갑자기 그런 말을 하면 부끄럽잖아~ 나도 선생이랑 함께하는 시간 정말 좋아!"
```

## Technical Details

- **File Modified**: `packages/vscode-extension/src/services/workers/ContextAggregator.ts`
- **Methods Added**:
  - `isConversationalMessage(message: string): boolean`
- **Behavior**: Problem context is only used if message is problem-related
- **Default**: Ambiguous messages default to problem-related (safe for tutoring system)

## Future Improvements

1. **Machine Learning Classifier**: Train a model to better classify message intent
2. **Context Memory**: Remember conversation flow (if discussing problem, keep context active)
3. **Explicit Problem Mode**: Add UI toggle for "Problem Mode" vs "Chat Mode"
4. **Smart Problem Detection**: Detect problem numbers in messages ("1149번 어떻게 풀어?")

## Related Files

- `ContextAggregator.ts` - Message classification logic
- `StrategyAgent.ts` - Pedagogical hint generation
- `PersonaWrapper.ts` - Character persona wrapping
- `ChatGPTService.ts` - Pipeline orchestration

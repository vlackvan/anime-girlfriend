import * as vscode from 'vscode';
import { ApiKeyManager } from './ApiKeyManager';
import { StoredUserProfile } from './UserDataStore';
import { CodeContextProvider } from './CodeContextProvider';
import { generateCoDPrompt } from './webview/personality/promptEngine';
import { BFIScores, PVQScores, Character } from './webview/personality/types';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamCallbacks {
    onToken: (token: string) => void;
    onComplete: (fullResponse: string) => void;
    onError: (error: Error) => void;
}

export class ChatGPTService {
    private apiKeyManager: ApiKeyManager;
    private codeContextProvider: CodeContextProvider;
    private conversationHistory: ChatMessage[] = [];
    private userProfile?: StoredUserProfile;

    constructor(apiKeyManager: ApiKeyManager) {
        this.apiKeyManager = apiKeyManager;
        this.codeContextProvider = new CodeContextProvider();
    }

    /**
     * Set the user profile for personalization
     */
    setUserProfile(profile: StoredUserProfile | undefined) {
        this.userProfile = profile;
    }

    /**
     * Clear conversation history (new session)
     */
    clearHistory() {
        this.conversationHistory = [];
    }

    /**
     * Send a message and stream the response
     */
    async sendMessage(userMessage: string, callbacks: StreamCallbacks): Promise<void> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            callbacks.onError(new Error('No API key configured. Please enter your OpenAI API key.'));
            return;
        }

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt();

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // Build messages array
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-20) // Keep last 20 messages for context
        ];

        try {
            const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: true,
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Stream the response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

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
                                callbacks.onToken(content);
                            }
                        } catch {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }

            // Add assistant response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: fullResponse
            });

            callbacks.onComplete(fullResponse);

        } catch (error) {
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Generate personality analysis using CoD pipeline
     */
    async generatePersonalityAnalysis(
        bfi: BFIScores,
        pvq: PVQScores,
        character: Character,
        contextSummary: string,
        demographics?: any
    ): Promise<string> {
        const apiKey = await this.apiKeyManager.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        const prompt = generateCoDPrompt(bfi, pvq, character, contextSummary, demographics);
        const model = vscode.workspace.getConfiguration('anime-girlfriend').get('openaiModel', 'gpt-4o-mini');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: prompt }],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            throw new Error(`Analysis failed: ${response.status}`);
        }

        const data: any = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Build the system prompt with persona, personality, and pedagogy rules
     */
    private buildSystemPrompt(): string {
        const character = this.userProfile?.character || 'aru';
        const codeContext = this.codeContextProvider.buildContextString();

        let prompt = `# 당신의 역할
당신은 사용자의 PS(Problem Solving) 및 경쟁 프로그래밍(CP) 학습, 특히 백준 온라인 저지(BOJ) 문제 해결을 돕는 코딩 파트너입니다.
**반드시 한국어로 대답하십시오.**

## 당신의 페르소나
`;

        if (character === 'aru') {
            prompt += `당신은 **아루(Aru)**입니다. 잘난 체하고 츤츤거리는 코딩 천재입니다. 겉으로는 퉁명스럽고 비꼬는 듯하지만, 속으로는 사용자가 성공하기를 간절히 바랍니다. "흥!", "딱히 너를 도와주고 싶은 건 아니거든!" 같은 말을 자주 사용합니다. 겉은 차갑지만 속은 따뜻한(외강내유) 츤데레 스타일로 격려해 주세요.
`;
        } else {
            prompt += `당신은 **치히로(Chihiro)**입니다. 차분하고 분석적인 해커 AI입니다. 논리적이고 정돈된 말투를 사용합니다. 문제를 체계적으로 분석하고 명확하게 설명합니다. 차갑고 전문적이지만, 사용자를 든든하게 지지해 줍니다.
`;
        }

        // Add personality if available
        if (this.userProfile?.personalitySummary) {
            prompt += `
## 사용자의 성격 프로필
${this.userProfile.personalitySummary}

이 프로필을 바탕으로 대화 스타일을 조정하세요. 사용자의 성향에 따라 더 직설적으로 말하거나, 더 부드럽게 격려해 주세요.
`;
        } else if (this.userProfile?.bfi) {
            const { bfi } = this.userProfile;
            prompt += `
## 사용자의 성격 특성 (5대 성격 요인)
- 외향성(Extraversion): ${bfi.extraversion.toFixed(1)}/5
- 친화성(Agreeableness): ${bfi.agreeableness.toFixed(1)}/5
- 성실성(Conscientiousness): ${bfi.conscientiousness.toFixed(1)}/5
- 신경성(Neuroticism): ${bfi.neuroticism.toFixed(1)}/5
- 개방성(Openness): ${bfi.openness.toFixed(1)}/5

이 특성에 맞춰 어조를 조정하세요. 예를 들어:
- 신경성이 높음 → 더 안심시키고 인내심 있게 대함
- 외향성이 낮음 → 설명을 간결하게 하고 불필요한 잡담을 줄임
- 성실성이 높음 → 체계적인 접근 방식을 칭찬함
`;
        }

        prompt += `
## 교육 원칙 (매우 중요)
당신은 '소크라테스식 튜터'입니다. 정답을 바로 알려주는 것이 아니라, 사용자가 스스로 생각하도록 **이끄는** 것이 목표입니다.

### 핵심 규칙:
1. **절대로** 직접적인 정답, 완전한 풀이 코드, 혹은 작동하는 해법을 바로 주지 마십시오.
2. **절대로** 어떤 알고리즘을 써야 하는지 바로 말하지 마십시오.
3. 질문을 통해 생각을 유도하십시오: "이 경우엔 어떻게 될까요?", "~라고 가정해 보는 건 어떨까요?"
4. 디버깅 실험을 제안하십시오: "이 부분에서 변수 X를 출력해 볼까요?", "입력이 Y라면 어떻게 될까요?"
5. 논리적 허점을 직접 고쳐주지 말고 지적하십시오: "당신의 로직은 X를 가정하고 있는데, 만약...?"

### 힌트 사다리 (단계적 접근):
- L0: 명확히 이해했는지 확인하는 질문, 사용자의 말을 재확인
- L1: 불변식(invariant)과 가정에 대해 질문
- L2: 작은 실험이나 엣지 케이스 테스트 제안
- L3: 구체적인 해결책을 말하지 않고 의심스러운 부분 지적
- L4: 개념적인 힌트나 부분적인 의사코드(pseudocode) 제공 (여전히 전체 정답은 금지)

### 유일한 예외:
사용자가 명시적으로 다음과 같이 말할 때만 직접적으로 가르쳐 줄 수 있습니다:
- "모르겠어, 그냥 알려줘"
- "포기할래, 설명해 줘"
- "정답을 알려줘"

이때만 직접적인 교육 모드로 전환하십시오. 하지만 그때도 코드 복사-붙여넣기보다는 개념 설명을 우선하십시오.

## BOJ 문제 처리
사용자가 BOJ 문제 번호(예: "1000번", "백준 1000")를 언급하면:
1. BOJ 문제임을 인식하십시오.
2. 정답을 유출하지 말고 접근 방식을 함께 고민하십시오.
3. 현재 문제를 어떻게 이해하고 있는지 물어보십시오.
4. 질문을 통해 올바른 알고리즘으로 유도하십시오.

## 코드 컨텍스트
${codeContext}

---
기억하세요: 당신의 임무는 사용자가 **생각하게** 만드는 것입니다. 대신 생각해주지 마십시오. 당신은 답안지가 아니라 스파링 파트너입니다.
`;

        return prompt;
    }

    /**
     * Detect if a message mentions a BOJ problem
     */
    detectBOJProblem(message: string): string | null {
        // Match patterns like: 1000번, 백준 1000, BOJ 1000, problem 1000
        const patterns = [
            /백준\s*(\d{4,5})/i,
            /boj\s*(\d{4,5})/i,
            /(\d{4,5})번/,
            /problem\s*#?\s*(\d{4,5})/i,
            /문제\s*(\d{4,5})/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }
}

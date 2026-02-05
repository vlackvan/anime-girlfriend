import React from 'react';

export type CodingState = 'NOT_STARTED' | 'WRITING' | 'HAS_ERROR' | 'SOLVED';

export interface CodingStateInfo {
    state: CodingState;
    codeLength: number;
    hasErrors: boolean;
    hasWarnings: boolean;
}

// Phase within each hint level
export type HintPhase = 'DEFAULT' | 'ADVANCE';

interface RecommendedQuestionsProps {
    codingState: CodingState;
    hintLevel: number;
    hintPhase: HintPhase;  // Which question to show at current level
    onQuestionClick: (question: string, shouldAdvanceHint: boolean, advancePhase: boolean) => void;
    disabled?: boolean;
}

// State-based question mapping (context-aware) - always shown
const QUESTIONS_BY_STATE: Record<CodingState, string[]> = {
    NOT_STARTED: ['문제 요약해줘', '입력 예시 설명해줘'],
    WRITING: ['시간 복잡도 괜찮아?'],
    HAS_ERROR: ['지금 에러 알려줘'],
    SOLVED: ['다른 풀이는 뭐가 있을까?']
};

// Level-based hint questions
interface LevelQuestions {
    default: string;      // Question shown first (keeps level, advances phase)
    advance: string;      // Question shown after default (advances level)
}

const QUESTIONS_BY_LEVEL: Record<number, LevelQuestions> = {
    0: {
        default: '내 접근법이 맞는지 봐줘',
        advance: '접근법을 모르겠어, 알려줘'
    },
    1: {
        default: '왜 이 알고리즘을 써야 해?',
        advance: '구현 방법을 모르겠어'
    },
    2: {
        default: '로직 순서가 이게 맞아?',
        advance: '로직은 알겠는데, 코드로 못 옮기겠어'
    },
    3: {
        default: '내 코드가 왜 틀렸는지 힌트 줘',
        advance: '도저히 안 풀려, 전체 정답 코드를 볼래'
    }
};

export const RecommendedQuestions: React.FC<RecommendedQuestionsProps> = ({
    codingState,
    hintLevel,
    hintPhase,
    onQuestionClick,
    disabled = false
}) => {
    const stateQuestions = QUESTIONS_BY_STATE[codingState];

    // If hint level is 4 or higher, user has exhausted all hints (received full solution)
    // Don't show any level-based questions
    const showLevelQuestions = hintLevel < 4;

    // Cap hint level at max (3) to ensure level questions always exist
    const cappedHintLevel = Math.min(hintLevel, 3);
    const levelQuestions = showLevelQuestions ? QUESTIONS_BY_LEVEL[cappedHintLevel] : null;

    return (
        <div className="recommended-questions">
            {/* State-based questions - always shown */}
            {stateQuestions.map((question, index) => (
                <button
                    key={`state-${index}`}
                    className="recommended-question-btn state-question"
                    onClick={() => onQuestionClick(question, false, false)}
                    disabled={disabled}
                >
                    {question}
                </button>
            ))}

            {/* Level-based question - show ONE at a time based on phase */}
            {/* Hide level questions if user has reached level 4 (full solution given) */}
            {levelQuestions && (
                <>
                    {hintPhase === 'DEFAULT' && (
                        <button
                            key="level-default"
                            className="recommended-question-btn level-question"
                            onClick={() => onQuestionClick(levelQuestions.default, false, true)}
                            disabled={disabled}
                        >
                            🎯 {levelQuestions.default}
                        </button>
                    )}
                    {hintPhase === 'ADVANCE' && (
                        <button
                            key="level-advance"
                            className="recommended-question-btn level-question advance"
                            onClick={() => onQuestionClick(levelQuestions.advance, true, false)}
                            disabled={disabled}
                        >
                            💡 {levelQuestions.advance}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

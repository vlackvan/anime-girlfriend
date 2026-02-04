import React from 'react';

export type CodingState = 'NOT_STARTED' | 'WRITING' | 'HAS_ERROR' | 'SOLVED';

export interface CodingStateInfo {
    state: CodingState;
    codeLength: number;
    hasErrors: boolean;
    hasWarnings: boolean;
}

interface RecommendedQuestionsProps {
    codingState: CodingState;
    onQuestionClick: (question: string) => void;
    disabled?: boolean;
}

// State-based question mapping
const QUESTIONS_BY_STATE: Record<CodingState, string[]> = {
    NOT_STARTED: ['문제 요약해줘', '어떤 알고리즘 써야 해?', '입력 예시 설명해줘'],
    WRITING: ['내 어프로치가 맞아?', '시간 복잡도 괜찮을까?'],
    HAS_ERROR: ['에러 원인 알려줘', '고쳐줘', '디버깅 힌트 줘'],
    SOLVED: ['코드 최적화 해줘', '다른 사람들은 어떻게 풀었어?']
};

export const RecommendedQuestions: React.FC<RecommendedQuestionsProps> = ({
    codingState,
    onQuestionClick,
    disabled = false
}) => {
    const questions = QUESTIONS_BY_STATE[codingState];

    return (
        <div className="recommended-questions">
            {questions.map((question, index) => (
                <button
                    key={index}
                    className="recommended-question-btn"
                    onClick={() => onQuestionClick(question)}
                    disabled={disabled}
                >
                    {question}
                </button>
            ))}
        </div>
    );
};

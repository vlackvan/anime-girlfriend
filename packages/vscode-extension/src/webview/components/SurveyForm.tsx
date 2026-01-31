import React, { useState } from 'react';
import { Character, UserProfile } from '../personality/types';
import { BFI_QUESTIONS, PVQ_QUESTIONS } from '../personality/questions';
import { scoreBFI, scorePVQ } from '../personality/scoring';
import { generateCoDPrompt } from '../personality/promptEngine';

interface SurveyFormProps {
    character: Character;
    onComplete: (profile: UserProfile) => void;
}

export const SurveyForm: React.FC<SurveyFormProps> = ({ character, onComplete }) => {
    const [phase, setPhase] = useState<'bfi' | 'pvq'>('bfi');
    const [bfiResponses, setBfiResponses] = useState<Record<number, number>>({});
    const [pvqResponses, setPvqResponses] = useState<Record<number, number>>({});
    const [analyzing, setAnalyzing] = useState(false);

    const handleBfiChange = (questionId: number, value: number) => {
        setBfiResponses(prev => ({ ...prev, [questionId]: value }));
    };

    const handlePvqChange = (questionId: number, value: number) => {
        setPvqResponses(prev => ({ ...prev, [questionId]: value }));
    };

    const handleBfiSubmit = () => {
        if (Object.keys(bfiResponses).length === BFI_QUESTIONS.length) {
            setPhase('pvq');
            window.scrollTo(0, 0);
        }
    };

    const handlePvqSubmit = async () => {
        if (Object.keys(pvqResponses).length === PVQ_QUESTIONS.length) {
            setAnalyzing(true);
            const bfiScores = scoreBFI(bfiResponses);
            const pvqScores = scorePVQ(pvqResponses);

            const analysisPrompt = generateCoDPrompt(bfiScores, pvqScores, character);

            // In a real app, we would send this prompt to the AI here to get the analysis.
            // For now, we store the prompt string so the chat can use it as system context.

            setTimeout(() => {
                onComplete({
                    bfi: bfiScores,
                    pvq: pvqScores,
                    character,
                    analysis: analysisPrompt // Passing the prompt to be used in Chat context
                });
            }, 1500); // Fake analysis delay
        }
    };

    const renderLikertScale = (
        questionId: number,
        responses: Record<number, number>,
        onChange: (id: number, value: number) => void,
        max: number
    ) => (
        <div className="likert-scale">
            {Array.from({ length: max }, (_, i) => i + 1).map(value => (
                <label key={value} className="likert-option">
                    <input
                        type="radio"
                        name={`q-${questionId}`}
                        value={value}
                        checked={responses[questionId] === value}
                        onChange={() => onChange(questionId, value)}
                    />
                    <span>{value}</span>
                </label>
            ))}
        </div>
    );

    if (analyzing) {
        return (
            <div className="onboarding">
                <h1>성격 분석 중...</h1>
                <p>CoD 파이프라인 실행 중...</p>
                <p className="subtitle">핵심 특성 식별 중...</p>
            </div>
        );
    }

    if (phase === 'bfi') {
        return (
            <div className="survey-form">
                <h2>성격 유형 검사 (1/2)</h2>
                <p className="subtitle">
                    나는...<br />
                    (1 = 전혀 그렇지 않다, 5 = 매우 그렇다)
                </p>

                <div className="questions">
                    {BFI_QUESTIONS.map((q) => (
                        <div key={q.id} className="question">
                            <p>{q.id}. {q.text}</p>
                            {renderLikertScale(q.id, bfiResponses, handleBfiChange, 5)}
                        </div>
                    ))}
                </div>

                <button
                    className="submit-btn"
                    onClick={handleBfiSubmit}
                    disabled={Object.keys(bfiResponses).length !== BFI_QUESTIONS.length}
                >
                    다음: 가치관 검사 →
                </button>
            </div>
        );
    }

    return (
        <div className="survey-form">
            <h2>가치관 검사 (2/2)</h2>
            <p className="subtitle">
                이 사람은 당신과 얼마나 비슷한가요?<br />
                (1 = 전혀 그렇지 않다, 6 = 매우 그렇다)
            </p>

            <div className="questions">
                {PVQ_QUESTIONS.map((q) => (
                    <div key={q.id} className="question">
                        <p>{q.id}. {q.text}</p>
                        {renderLikertScale(q.id, pvqResponses, handlePvqChange, 6)}
                    </div>
                ))}
            </div>

            <button
                className="submit-btn"
                onClick={handlePvqSubmit}
                disabled={Object.keys(pvqResponses).length !== PVQ_QUESTIONS.length}
            >
                완료 및 분석 생성
            </button>
        </div>
    );
};

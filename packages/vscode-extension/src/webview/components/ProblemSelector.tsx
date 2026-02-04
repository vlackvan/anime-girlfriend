import React, { useState, useEffect } from 'react';
import { OnboardingLayout } from './OnboardingLayout';

interface ProblemSelectorProps {
    onSelect: (problemId: string) => void;
    onClose: () => void;
    userTier?: number;
    solvedCount?: number;
}

interface RecommendedProblem {
    problemId: string;
    title: string;
    level: string;
    tags: string[];
}

export const ProblemSelector: React.FC<ProblemSelectorProps> = ({
    onSelect,
    onClose,
    userTier = 0,
    solvedCount = 0
}) => {
    const [manualInput, setManualInput] = useState('');
    const [recommendations, setRecommendations] = useState<RecommendedProblem[]>([]);
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

    useEffect(() => {
        // Request recommendations from backend
        setIsLoadingRecommendations(true);
        window.vscode.postMessage({
            type: 'getRecommendedProblems',
            data: { userTier, solvedCount }
        });

        const handler = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'recommendedProblems') {
                setRecommendations(message.data);
                setIsLoadingRecommendations(false);
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [userTier, solvedCount]);

    const handleManualSubmit = () => {
        const problemId = manualInput.trim();
        if (problemId && /^\d+$/.test(problemId)) {
            onSelect(problemId);
        }
    };

    const handleRecommendationClick = (problemId: string) => {
        onSelect(problemId);
    };

    return (
        <div className="problem-selector-overlay" onClick={onClose}>
            <div className="problem-selector-modal" onClick={(e) => e.stopPropagation()}>
                <OnboardingLayout title="오늘 풀 문제 선택">
                    <div className="problem-selector-content">
                        {/* Manual Input Section */}
                        <div className="manual-problem-input">
                            <label htmlFor="problemId">백준 문제 번호 직접 입력</label>
                            <div className="input-with-button">
                                <input
                                    id="problemId"
                                    type="text"
                                    placeholder="예: 1000"
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleManualSubmit();
                                        }
                                    }}
                                />
                                <button
                                    className="submit-btn"
                                    onClick={handleManualSubmit}
                                    disabled={!manualInput.trim() || !/^\d+$/.test(manualInput.trim())}
                                >
                                    <span>선택</span>
                                </button>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="or-divider">
                            <span>또는</span>
                        </div>

                        {/* Recommended Problems Section */}
                        <div className="recommended-problems">
                            <label>현재 실력 기반 추천 문제</label>
                            {isLoadingRecommendations ? (
                                <div className="loading-spinner">문제 추천 중...</div>
                            ) : recommendations.length === 0 ? (
                                <p className="no-recommendations">추천 문제를 불러올 수 없습니다.</p>
                            ) : (
                                <div className="problem-list">
                                    {recommendations.map((problem) => (
                                        <div
                                            key={problem.problemId}
                                            className="problem-card"
                                            onClick={() => handleRecommendationClick(problem.problemId)}
                                        >
                                            <div className="problem-header">
                                                <span className="problem-id">#{problem.problemId}</span>
                                                <span className="problem-level">{problem.level}</span>
                                            </div>
                                            <div className="problem-title">{problem.title}</div>
                                            <div className="problem-tags">
                                                {problem.tags.slice(0, 3).map((tag, idx) => (
                                                    <span key={idx} className="tag">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Close Button */}
                        <button className="close-selector-btn" onClick={onClose}>
                            나중에 선택하기
                        </button>
                    </div>
                </OnboardingLayout>
            </div>
        </div>
    );
};

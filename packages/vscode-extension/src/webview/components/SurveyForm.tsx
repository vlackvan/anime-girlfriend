import React, { useState } from 'react';
import { Character, UserProfile, Demographics } from '../personality/types';
import { BFI_QUESTIONS, PVQ_QUESTIONS } from '../personality/questions';
import { scoreBFI, scorePVQ } from '../personality/scoring';
import { generateCoDPrompt } from '../personality/promptEngine';

interface SurveyFormProps {
    character: Character;
    demographics?: Demographics;
    onComplete: (profile: UserProfile & { solvedAcData?: any; contextSummary: string }) => void;
}

const ALGORITHM_TAGS = [
    'DP (동적 프로그래밍)',
    'DFS (깊이 우선 탐색)',
    'BFS (너비 우선 탐색)',
    'Greedy (탐욕법)',
    'Implementation (구현)',
    'Graph (그래프)',
    'Tree (트리)',
    'Math (수학)',
    'String (문자열)',
    'Backtracking (백트래킹)',
    'Binary Search (이분 탐색)',
    'Sorting (정렬)',
];

export const SurveyForm: React.FC<SurveyFormProps> = ({ character, demographics, onComplete }) => {
    const [phase, setPhase] = useState<'bfi' | 'pvq' | 'solvedac'>('bfi');
    const [bfiResponses, setBfiResponses] = useState<Record<number, number>>({});
    const [pvqResponses, setPvqResponses] = useState<Record<number, number>>({});
    const [analyzing, setAnalyzing] = useState(false);

    // Solved.ac phase state
    const [solvedacMode, setSolvedacMode] = useState<'choice' | 'connect' | 'manual'>('choice');
    const [bojHandle, setBojHandle] = useState('');
    const [fetchingStats, setFetchingStats] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [manualProblemCount, setManualProblemCount] = useState('none');
    const [manualProficient, setManualProficient] = useState<string[]>([]);
    const [manualWeak, setManualWeak] = useState<string[]>([]);
    const [solvedacData, setSolvedacData] = useState<any>(null);

    const handleBfiChange = (questionId: number, value: number) => {
        setBfiResponses(prev => ({ ...prev, [questionId]: value }));
    };

    const handlePvqChange = (questionId: number, value: number) => {
        setPvqResponses(prev => ({ ...prev, [questionId]: value }));
    };

    const handleBfiSubmit = () => {
        if (Object.keys(bfiResponses).length === BFI_QUESTIONS.length) {
            setPhase('pvq');
            // Scroll to top for the next survey phase
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 0);
        }
    };

    const handlePvqSubmit = async () => {
        if (Object.keys(pvqResponses).length === PVQ_QUESTIONS.length) {
            setPhase('solvedac');
            window.scrollTo(0, 0);
        }
    };

    const handleFetchSolvedac = async () => {
        if (!bojHandle.trim()) {
            setFetchError('BOJ 핸들을 입력해주세요.');
            return;
        }

        setFetchingStats(true);
        setFetchError('');

        try {
            // Post message to extension to fetch stats
            (window as any).vscode.postMessage({
                type: 'fetchSolvedacStats',
                handle: bojHandle.trim()
            });

            // Extension will respond with 'solvedacStatsFetched' message
        } catch (error) {
            setFetchError('통계를 가져오는데 실패했습니다.');
            setFetchingStats(false);
        }
    };

    const handleSkipSolvedac = () => {
        const skipData = null; // Explicitly no data
        setSolvedacData(skipData); // Set state so it's saved in profile
        proceedToAnalysis(skipData, '알고리즘 문제 해결 경험 정보 없음.');
    };

    const handleManualSubmit = () => {
        // Generate fallback summary
        const summary = generateManualSummary(manualProblemCount, manualProficient, manualWeak);
        const data = {
            problemCount: manualProblemCount,
            proficientAreas: manualProficient,
            weakAreas: manualWeak,
            summary
        };
        setSolvedacData(data); // Set state so it's saved in profile
        proceedToAnalysis(data, summary);
    };

    const generateManualSummary = (problemCount: string, proficient: string[], weak: string[]): string => {
        const parts: string[] = [];
        const countMap: { [key: string]: string } = {
            'none': '아직 알고리즘 문제를 풀어보지 않았습니다.',
            '1-50': '알고리즘 문제 해결을 시작한 초심자입니다. 약 1-50개의 문제를 해결했습니다.',
            '51-100': '기초를 다지고 있는 학습자입니다. 약 51-100개의 문제를 해결했습니다.',
            '101-500': '꾸준히 연습하며 실력을 쌓아가고 있습니다. 약 101-500개의 문제를 해결했습니다.',
            '501-1000': '상당한 경험을 쌓은 숙련된 문제 해결자입니다. 약 501-1000개의 문제를 해결했습니다.',
            '1000+': '풍부한 경험을 가진 고수입니다. 1000개 이상의 문제를 해결했습니다.',
        };
        parts.push(countMap[problemCount] || countMap['none']);
        if (proficient.length > 0) {
            parts.push(`강점 분야는 ${proficient.join(', ')}입니다.`);
        }
        if (weak.length > 0) {
            parts.push(`보완이 필요한 분야는 ${weak.join(', ')}입니다.`);
        }
        return parts.join(' ');
    };

    const proceedToAnalysis = (data: any, contextSummary: string) => {
        setAnalyzing(true);
        const bfiScores = scoreBFI(bfiResponses);
        const pvqScores = scorePVQ(pvqResponses);

        // Send to extension for AI personality generation
        (window as any).vscode.postMessage({
            type: 'generatePersonality',
            data: {
                bfi: bfiScores,
                pvq: pvqScores,
                character,
                demographics,
                solvedAcData: data,
                contextSummary
            }
        });
    };

    // Listen for messages from extension
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.type === 'solvedacStatsFetched') {
                setFetchingStats(false);
                if (message.error) {
                    setFetchError(message.error);
                } else {
                    setSolvedacData(message.data);
                    proceedToAnalysis(message.data, message.data.summary);
                }
            } else if (message.type === 'personalityGenerated') {
                onComplete({
                    bfi: scoreBFI(bfiResponses),
                    pvq: scorePVQ(pvqResponses),
                    character,
                    analysis: message.summary,
                    solvedAcData: message.solvedAcData, // Use the data sent back from extension
                    contextSummary: message.contextSummary || ''
                });
            } else if (message.type === 'personalityGenerationError') {
                setAnalyzing(false);
                setFetchError(message.error || '성격 분석 생성에 실패했습니다.');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [solvedacData, bfiResponses, pvqResponses, character, onComplete]);

    const toggleManualTag = (tag: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
        if (list.includes(tag)) {
            setter(list.filter(t => t !== tag));
        } else {
            setter([...list, tag]);
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
                <h1>성격 프로필 생성 중...</h1>
                <p>AI가 당신의 성격을 분석하고 있습니다...</p>
                <p className="subtitle">CoD 파이프라인 실행 중 (약 10-15초 소요)</p>
            </div>
        );
    }

    if (phase === 'solvedac') {
        if (solvedacMode === 'choice') {
            return (
                <div className="survey-form">
                    <h2>알고리즘 실력 연동 (3/3)</h2>
                    <p className="subtitle">
                        백준 온라인 저지 경험을 연결하면 더 정확한 성격 분석이 가능합니다.
                    </p>

                    <div className="solvedac-choice">
                        <button
                            className="choice-btn primary"
                            onClick={() => setSolvedacMode('connect')}
                        >
                            <strong>BOJ 핸들 연결</strong>
                            <span className="subtitle">Solved.ac에서 자동으로 통계 가져오기</span>
                        </button>

                        <button
                            className="choice-btn"
                            onClick={() => setSolvedacMode('manual')}
                        >
                            <strong>직접 입력</strong>
                            <span className="subtitle">수동으로 경험 입력하기</span>
                        </button>

                        <button
                            className="skip-btn"
                            onClick={handleSkipSolvedac}
                        >
                            건너뛰기
                        </button>
                    </div>
                </div>
            );
        }

        if (solvedacMode === 'connect') {
            return (
                <div className="survey-form">
                    <h2>BOJ 핸들 연결</h2>
                    <p className="subtitle">
                        백준 온라인 저지 핸들을 입력하세요.
                    </p>

                    <div className="solvedac-connect">
                        <input
                            type="text"
                            className="boj-handle-input"
                            placeholder="예: q99"
                            value={bojHandle}
                            onChange={(e) => setBojHandle(e.target.value)}
                            disabled={fetchingStats}
                        />

                        {fetchError && (
                            <p className="error-message">{fetchError}</p>
                        )}

                        <div className="button-group">
                            <button
                                className="submit-btn"
                                onClick={handleFetchSolvedac}
                                disabled={fetchingStats || !bojHandle.trim()}
                            >
                                {fetchingStats ? '가져오는 중...' : '정보 가져오기'}
                            </button>

                            <button
                                className="back-btn"
                                onClick={() => {
                                    setSolvedacMode('choice');
                                    setFetchError('');
                                }}
                                disabled={fetchingStats}
                            >
                                뒤로
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        if (solvedacMode === 'manual') {
            return (
                <div className="survey-form">
                    <h2>알고리즘 경험 입력</h2>
                    <p className="subtitle">
                        대략적인 경험을 입력해주세요.
                    </p>

                    <div className="manual-input">
                        <div className="form-group">
                            <label>해결한 문제 수</label>
                            <select
                                value={manualProblemCount}
                                onChange={(e) => setManualProblemCount(e.target.value)}
                                className="problem-count-select"
                            >
                                <option value="none">없음 / 처음 시작</option>
                                <option value="1-50">1-50개</option>
                                <option value="51-100">51-100개</option>
                                <option value="101-500">101-500개</option>
                                <option value="501-1000">501-1000개</option>
                                <option value="1000+">1000개 이상</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>강점 분야 (다중 선택 가능)</label>
                            <div className="tag-grid">
                                {ALGORITHM_TAGS.map(tag => (
                                    <button
                                        key={tag}
                                        className={`tag-btn ${manualProficient.includes(tag) ? 'selected' : ''}`}
                                        onClick={() => toggleManualTag(tag, manualProficient, setManualProficient)}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>보완이 필요한 분야 (다중 선택 가능)</label>
                            <div className="tag-grid">
                                {ALGORITHM_TAGS.map(tag => (
                                    <button
                                        key={tag}
                                        className={`tag-btn ${manualWeak.includes(tag) ? 'selected' : ''}`}
                                        onClick={() => toggleManualTag(tag, manualWeak, setManualWeak)}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="button-group">
                            <button
                                className="submit-btn"
                                onClick={handleManualSubmit}
                            >
                                계속
                            </button>

                            <button
                                className="back-btn"
                                onClick={() => setSolvedacMode('choice')}
                            >
                                뒤로
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
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

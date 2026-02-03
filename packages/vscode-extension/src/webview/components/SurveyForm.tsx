import React, { useState } from 'react';
import { Character, UserProfile, Demographics, UserEssays } from '../personality/types';

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
    // Phases: essay -> solvedac
    const [phase, setPhase] = useState<'essay' | 'solvedac'>('essay');
    const [essays, setEssays] = useState<UserEssays>({
        routine: '',
        struggle: '',
        goal: ''
    });
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

    const handleEssayChange = (field: keyof UserEssays, value: string) => {
        setEssays(prev => ({ ...prev, [field]: value }));
    };

    const handleEssaySubmit = () => {
        if (essays.routine.trim() && essays.struggle.trim() && essays.goal.trim()) {
            setPhase('solvedac');
            window.scrollTo(0, 0);
        } else {
            alert('모든 질문에 답변해주세요.');
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
        } catch (error) {
            setFetchError('통계를 가져오는데 실패했습니다.');
            setFetchingStats(false);
        }
    };

    const handleSkipSolvedac = () => {
        const skipData = null; // Explicitly no data
        setSolvedacData(skipData);
        proceedToAnalysis(skipData, '알고리즘 문제 해결 경험 정보 없음.');
    };

    const handleManualSubmit = () => {
        const summary = generateManualSummary(manualProblemCount, manualProficient, manualWeak);
        const data = {
            problemCount: manualProblemCount,
            proficientAreas: manualProficient,
            weakAreas: manualWeak,
            summary
        };
        setSolvedacData(data);
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

        // Send to extension for AI personality generation
        (window as any).vscode.postMessage({
            type: 'generatePersonality',
            data: {
                essays, // Send the essays
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
                if (message.data) {
                    setSolvedacData(message.data);
                    setSolvedacMode('connect');
                } else if (message.error) {
                    setFetchError(message.error);
                }
            } else if (message.type === 'personalityGenerated') {
                setAnalyzing(false);
                onComplete({
                    character,
                    demographics,
                    essays,
                    analysis: message.summary,
                    coreMemories: message.coreMemories,
                    solvedAcData: message.solvedAcData,
                    contextSummary: message.contextSummary || ''
                });
            } else if (message.type === 'personalityGenerationError') {
                setAnalyzing(false);
                alert(message.error);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [solvedacData, essays, character, onComplete]);

    const toggleManualTag = (tag: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
        if (list.includes(tag)) {
            setter(list.filter(t => t !== tag));
        } else {
            setter([...list, tag]);
        }
    };

    if (analyzing) {
        return (
            <div className="onboarding">
                <div className="loading-container">
                    <img
                        src={(window as any).assetBaseUri.loading}
                        alt="Analyzing"
                        className="loading-image"
                    />
                    <h1 className="loading-text">성격 프로필 생성 중...</h1>
                    <p className="loading-subtitle">SPeCtrum 프레임워크 분석 중 (약 10-15초 소요)</p>
                </div>
            </div>
        );
    }

    if (phase === 'essay') {
        return (
            <div className="survey-form">
                <h2>당신에 대해 알려주세요 (1/2)</h2>
                <p className="subtitle">
                    더 나은 코칭을 위해 당신의 평소 습관과 생각을 솔직하게 적어주세요.
                </p>

                <div className="essay-questions">
                    <div className="form-group">
                        <label>1. [Context] 평소 코딩 루틴은 어떤가요?</label>
                        <p className="hint">예: "주로 밤늦게까지 3시간씩 몰입한다", "주말에 몰아서 한다", "중간중간 자주 쉰다"</p>
                        <textarea
                            value={essays.routine}
                            onChange={(e) => handleEssayChange('routine', e.target.value)}
                            rows={3}
                            placeholder="당신의 코딩 습관을 적어주세요..."
                        />
                    </div>

                    <div className="form-group">
                        <label>2. [Struggle] 해결되지 않는 버그를 만났을 때 어떻게 반응하나요?</label>
                        <p className="hint">예: "화가 나서 키보드를 친다", "잠시 산책을 다녀온다", "오기가 생겨서 끝까지 파고든다"</p>
                        <textarea
                            value={essays.struggle}
                            onChange={(e) => handleEssayChange('struggle', e.target.value)}
                            rows={3}
                            placeholder="스트레스 상황에서의 반응을 적어주세요..."
                        />
                    </div>

                    <div className="form-group">
                        <label>3. [Goal] 3년 뒤 당신은 어떤 모습이고 싶나요?</label>
                        <p className="hint">예: "실리콘밸리 개발자", "나만의 서비스를 운영하는 창업가", "워라밸을 즐기는 시니어"</p>
                        <textarea
                            value={essays.goal}
                            onChange={(e) => handleEssayChange('goal', e.target.value)}
                            rows={3}
                            placeholder="당신의 목표를 적어주세요..."
                        />
                    </div>
                </div>

                <button
                    className="submit-btn"
                    onClick={handleEssaySubmit}
                    disabled={!essays.routine.trim() || !essays.struggle.trim() || !essays.goal.trim()}
                >
                    <span>다음: 알고리즘 실력 연동 →</span>
                </button>
            </div>
        );
    }

    // Solved.ac Phase (Largely unchanged structure, just logic flow connected from Essay)
    if (phase === 'solvedac') {
        if (solvedacMode === 'choice') {
            return (
                <div className="survey-form">
                    <h2>알고리즘 실력 연동 (2/2)</h2>
                    <p className="subtitle">
                        백준 온라인 저지 경험을 연결하면 더 정확한 성격 분석이 가능합니다.
                    </p>

                    <div className="solvedac-choice">
                        <button
                            className="choice-btn primary"
                            onClick={() => setSolvedacMode('connect')}
                        >
                            <strong>BOJ 아이디 연결</strong>
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
                            disabled={fetchingStats || !!solvedacData}
                        />

                        {fetchError && (
                            <p className="error-message">{fetchError}</p>
                        )}

                        {solvedacData && (
                            <div className="stats-preview" style={{
                                padding: '16px',
                                background: 'rgba(74, 222, 128, 0.1)',
                                border: '1px solid #4ade80',
                                borderRadius: '8px',
                                fontSize: '0.9rem'
                            }}>
                                <strong>✅ 연동 성공!</strong>
                                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                                    <li>핸들: {solvedacData.handle}</li>
                                    <li>티어: {solvedacData.tier}</li>
                                    <li>해결: {solvedacData.solvedCount}문제</li>
                                </ul>
                                <p style={{ marginTop: '8px', fontSize: '0.8rem', color: '#666' }}>
                                    {solvedacData.summary.substring(0, 100)}...
                                </p>
                            </div>
                        )}

                        <div className="button-group">
                            {!solvedacData ? (
                                <>
                                    <button
                                        className="submit-btn"
                                        onClick={handleFetchSolvedac}
                                        disabled={fetchingStats || !bojHandle.trim()}
                                    >
                                        <span>{fetchingStats ? '가져오는 중...' : '정보 가져오기'}</span>
                                    </button>

                                    <button
                                        className="back-btn"
                                        onClick={() => {
                                            setSolvedacMode('choice');
                                            setFetchError('');
                                        }}
                                        disabled={fetchingStats}
                                    >
                                        <span>뒤로</span>
                                    </button>
                                </>
                            ) : (
                                <button
                                    className="submit-btn"
                                    onClick={() => proceedToAnalysis(solvedacData, solvedacData.summary)}
                                >
                                    <span>계속하기 (분석 시작)</span>
                                </button>
                            )}
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
                                <span>계속</span>
                            </button>

                            <button
                                className="back-btn"
                                onClick={() => setSolvedacMode('choice')}
                            >
                                <span>뒤로</span>
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
    }

    return null;
};

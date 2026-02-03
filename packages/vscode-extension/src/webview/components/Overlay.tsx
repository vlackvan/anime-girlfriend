import React from 'react';
import { Character } from '../personality/types';

type JudgeStatus = 'accepted' | 'wrong_answer' | 'time_limit' | 'memory_limit' |
    'runtime_error' | 'compile_error' | 'output_limit' |
    'presentation_error' | 'unknown';

interface OverlayProps {
    character: Character;
    problemId: string;
    resultText?: string;
    status?: JudgeStatus;
    memory?: string;
    time?: string;
    onClose: () => void;
}

export const Overlay: React.FC<OverlayProps> = ({
    character,
    problemId,
    resultText,
    status = 'accepted',
    memory,
    time,
    onClose
}) => {
    const getMessages = () => {
        if (status === 'accepted') {
            return {
                aru: [
                    "흥! 딱히 너를 위해 준비한 건 아니지만... 잘했어!",
                    "정말 해낸 거야?! ...뭐, 당연히 그럴 줄 알았지만. 네가 해낼 거라고 믿었으니까!",
                    "거 봐! 너도 할 수 있다니까. 그렇다고 너무 우쭐대지는 마!"
                ],
                chihiro: [
                    "훌륭합니다. 당신의 논리적인 접근이 빛을 발했군요.",
                    "문제 해결 완료. 디버깅 실력이 점점 좋아지고 있습니다.",
                    "좋은 성과입니다. 이번 문제에서 무엇을 배웠는지 분석해 봅시다."
                ]
            };
        } else if (status === 'wrong_answer') {
            return {
                aru: [
                    "흥... 틀렸네. 하지만 포기하지 마! 다시 생각해봐.",
                    "틀렸다고? 뭐, 당연히 처음엔 그럴 수 있어. 다시 도전해봐!",
                    "흠... 이번엔 아니었네. 하지만 실패는 성공의 어머니라고 하잖아?"
                ],
                chihiro: [
                    "틀렸습니다. 로직을 다시 검토해 보세요.",
                    "잘못된 답입니다. 테스트 케이스를 다시 확인해 봅시다.",
                    "오답입니다. 알고리즘의 엣지 케이스를 점검해 보세요."
                ]
            };
        } else if (status === 'time_limit') {
            return {
                aru: [
                    "시간 초과? 흠... 알고리즘을 더 효율적으로 만들어야 할 것 같아.",
                    "시간이 부족했네. 복잡도를 줄이는 방법을 생각해봐!",
                    "시간 초과야... 최적화가 필요해 보이는데?"
                ],
                chihiro: [
                    "시간 초과입니다. 시간 복잡도를 개선해야 합니다.",
                    "TLE가 발생했습니다. 알고리즘의 효율성을 재검토하세요.",
                    "시간 제한을 초과했습니다. 불필요한 연산을 제거해 보세요."
                ]
            };
        } else if (status === 'memory_limit') {
            return {
                aru: [
                    "메모리 초과? 메모리를 덜 쓰는 방법을 찾아봐!",
                    "메모리가 부족했네. 공간 복잡도를 줄여봐.",
                    "MLE야... 메모리 사용량을 줄이는 게 필요해."
                ],
                chihiro: [
                    "메모리 초과입니다. 공간 복잡도를 최적화해야 합니다.",
                    "MLE가 발생했습니다. 불필요한 데이터 구조를 제거하세요.",
                    "메모리 제한을 초과했습니다. 메모리 사용량을 줄이는 방법을 고려하세요."
                ]
            };
        } else if (status === 'runtime_error') {
            return {
                aru: [
                    "런타임 에러? 배열 인덱스나 null 체크를 확인해봐!",
                    "RE가 발생했네. 예외 처리를 확인해봐.",
                    "런타임 에러야... 경계 조건을 체크해봐!"
                ],
                chihiro: [
                    "런타임 에러입니다. 배열 범위와 null 포인터를 확인하세요.",
                    "RE가 발생했습니다. 예외 상황을 처리하는 코드를 추가하세요.",
                    "런타임 에러입니다. 디버깅을 통해 원인을 파악해 봅시다."
                ]
            };
        } else if (status === 'compile_error') {
            return {
                aru: [
                    "컴파일 에러? 문법을 다시 확인해봐!",
                    "CE가 발생했네. 오타나 세미콜론을 체크해봐.",
                    "컴파일 에러야... 코드 문법을 점검해봐!"
                ],
                chihiro: [
                    "컴파일 에러입니다. 문법 오류를 확인하세요.",
                    "CE가 발생했습니다. 컴파일러 메시지를 자세히 읽어보세요.",
                    "컴파일 에러입니다. 타입과 문법을 점검해 봅시다."
                ]
            };
        } else {
            return {
                aru: [
                    "흠... 결과가 이상한데? 다시 확인해봐.",
                    "뭔가 문제가 있는 것 같아. 한 번 더 체크해봐!",
                    "이상한 결과네... 다시 시도해볼까?"
                ],
                chihiro: [
                    "알 수 없는 결과입니다. 다시 확인해 보세요.",
                    "예상치 못한 결과입니다. 문제를 재검토하세요.",
                    "결과를 파악할 수 없습니다. 로그를 확인해 봅시다."
                ]
            };
        }
    };

    const messages = getMessages()[character];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    const isSuccess = status === 'accepted';
    const emoji = isSuccess ? '🎉🎊✨🌟💫' : '💭🔍📝';

    return (
        <div className={`overlay ${isSuccess ? 'overlay-success overlay-portrait' : 'overlay-failure'}`} onClick={onClose}>
            {isSuccess && (
                <img
                    src={character === 'aru' ? window.assetBaseUri?.aruPortrait : window.assetBaseUri?.chihiroPortrait}
                    alt={`${character} portrait`}
                    className="portrait-bg"
                />
            )}

            {isSuccess ? (
                <div className="crystal-banner">
                    {/* Floating Particles */}
                    <div className="particles-container">
                        {[...Array(15)].map((_, i) => (
                            <div key={i} className="particle" style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 2}s`,
                                transform: `scale(${0.5 + Math.random()})`
                            }} />
                        ))}
                    </div>

                    <h1>문제 해결!</h1>
                    <h2 className="result-text">Problem #{problemId}</h2>

                    {(memory || time) && (
                        <div className="judge-info">
                            {time && <span className="info-item">⏱️ {time}</span>}
                            {memory && <span className="info-item">💾 {memory}</span>}
                        </div>
                    )}

                    <p className="congrats-message">"{randomMessage}"</p>

                    <p className="tap-hint">화면을 눌러서 계속하기</p>
                </div>
            ) : (
                <div className="overlay-content">
                    <div className="confetti">{emoji}</div>

                    <img
                        src={character === 'aru' ? window.assetBaseUri?.aru : window.assetBaseUri?.chihiro}
                        alt={character}
                        className="celebration-image"
                    />

                    <h1>문제 #{problemId}</h1>
                    <h2 className="result-text">{resultText || '결과'}</h2>

                    {(memory || time) && (
                        <div className="judge-info">
                            {time && <span className="info-item">⏱️ {time}</span>}
                            {memory && <span className="info-item">💾 {memory}</span>}
                        </div>
                    )}

                    <p className="congrats-message">"{randomMessage}"</p>

                    <p className="tap-hint">화면을 눌러서 계속하기</p>
                </div>
            )}
        </div>
    );
};

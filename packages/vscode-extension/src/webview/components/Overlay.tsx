import React from 'react';
import { Character } from '../personality/types';
import { getCharacter } from '../../characters';

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
    const characterDef = getCharacter(character);
    const messages = characterDef.messages[status] || characterDef.messages.unknown;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    const isSuccess = status === 'accepted';
    const emoji = isSuccess ? '🎉🎊✨🌟💫' : '💭🔍📝';

    return (
        <div className={`overlay ${isSuccess ? 'overlay-success overlay-portrait' : 'overlay-failure'}`} onClick={onClose}>
            {isSuccess && (
                <img
                    src={window.assetBaseUri?.[`${character}Portrait`] || ''}
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
                        src={window.assetBaseUri?.[character] || ''}
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

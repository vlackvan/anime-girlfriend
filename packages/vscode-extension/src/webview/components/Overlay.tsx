import React from 'react';
import { Character } from '../personality/types';

interface OverlayProps {
    character: Character;
    problemId: string;
    onClose: () => void;
}

export const Overlay: React.FC<OverlayProps> = ({ character, problemId, onClose }) => {
    const congratsMessages = {
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

    const messages = congratsMessages[character];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    return (
        <div className="overlay" onClick={onClose}>
            <div className="overlay-content">
                <div className="confetti">🎉🎊✨🌟💫</div>

                <img
                    src={character === 'aru' ? window.assetBaseUri?.aru : window.assetBaseUri?.chihiro}
                    alt={character}
                    className="celebration-image"
                />

                <h1>문제 #{problemId} 해결!</h1>

                <p className="congrats-message">"{randomMessage}"</p>

                <p className="tap-hint">화면을 눌러서 계속하기</p>
            </div>
        </div>
    );
};

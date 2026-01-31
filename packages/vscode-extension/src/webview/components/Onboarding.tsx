import React from 'react';
import { Character } from '../personality/types';

interface OnboardingProps {
    onCharacterSelect: (character: Character) => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onCharacterSelect }) => {
    return (
        <div className="onboarding">
            <h1>환영합니다! 파트너를 선택하세요</h1>
            <p className="subtitle">당신의 코딩 여정을 함께할 파트너를 선택해 주세요</p>

            <div className="character-grid">
                <div
                    className="character-card"
                    onClick={() => onCharacterSelect('aru')}
                >
                    <img
                        src={window.assetBaseUri?.aru || ''}
                        alt="Aru"
                        className="character-image"
                    />
                    <h2>Aru</h2>
                    <p>잔소리가 많고 제멋대로지만, 사실은 당신을 깊이 아끼고 있어요. 츤데레 매력의 소유자!</p>
                </div>

                <div
                    className="character-card"
                    onClick={() => onCharacterSelect('chihiro')}
                >
                    <img
                        src={window.assetBaseUri?.chihiro || ''}
                        alt="Chihiro"
                        className="character-image"
                    />
                    <h2>Chihiro</h2>
                    <p>논리적이고 분석적인 천재 해커. 당신이 문제를 체계적으로 해결하도록 도와줍니다.</p>
                </div>
            </div>
        </div>
    );
};

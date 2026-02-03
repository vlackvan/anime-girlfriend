import React, { useState } from 'react';
import { Character } from '../personality/types';

interface OnboardingProps {
    onCharacterSelect: (character: Character) => void;
}

const characterInfo = {
    aru: {
        name: 'Aru',
        description: '잔소리가 많고 제멋대로지만, 사실은 당신을 깊이 아끼고 있어요. 츤데레 매력의 소유자!'
    },
    chihiro: {
        name: 'Chihiro',
        description: '논리적이고 분석적인 천재 해커. 당신이 문제를 체계적으로 해결하도록 도와줍니다.'
    }
};

export const Onboarding: React.FC<OnboardingProps> = ({ onCharacterSelect }) => {
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

    const handleCharacterClick = (character: Character) => {
        setSelectedCharacter(character);
    };

    const handleConfirmSelection = () => {
        if (selectedCharacter) {
            onCharacterSelect(selectedCharacter);
        }
    };

    return (
        <div className="onboarding">
            <h1>환영합니다! 파트너를 선택하세요</h1>
            <p className="subtitle">당신의 코딩 여정을 함께할 파트너를 선택해 주세요</p>

            <div className="character-grid">
                <div
                    className={`character-card ${selectedCharacter === 'aru' ? 'selected' : ''}`}
                    onClick={() => handleCharacterClick('aru')}
                >
                    <img
                        src={window.assetBaseUri?.aruPortrait || window.assetBaseUri?.aru || ''}
                        alt="Aru"
                        className="character-image"
                        style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: '12px',
                            objectFit: 'cover'
                        }}
                    />
                    <h2>{characterInfo.aru.name}</h2>
                </div>

                <div
                    className={`character-card ${selectedCharacter === 'chihiro' ? 'selected' : ''}`}
                    onClick={() => handleCharacterClick('chihiro')}
                >
                    <img
                        src={window.assetBaseUri?.chihiroPortrait || window.assetBaseUri?.chihiro || ''}
                        alt="Chihiro"
                        className="character-image"
                        style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: '12px',
                            objectFit: 'cover'
                        }}
                    />
                    <h2>{characterInfo.chihiro.name}</h2>
                </div>
            </div>

            {selectedCharacter && (
                <>
                    <div className="character-popover">
                        <p>{characterInfo[selectedCharacter].description}</p>
                    </div>
                    <button
                        className="select-character-btn"
                        onClick={handleConfirmSelection}
                    >
                        <span>선택하기</span>
                    </button>
                </>
            )}
        </div>
    );
};

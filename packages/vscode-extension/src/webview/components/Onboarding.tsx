import React from 'react';
import { Character } from '../personality/types';

interface OnboardingProps {
    onCharacterSelect: (character: Character) => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onCharacterSelect }) => {
    return (
        <div className="onboarding">
            <h1>Welcome! Choose Your Companion</h1>
            <p className="subtitle">Select who will guide you through your coding journey</p>

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
                    <p>Bossy, dramatic, but secretly supportive. She'll push you hard but celebrate your victories!</p>
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
                    <p>Logical, analytical, a true hacker. She'll help you think through problems systematically.</p>
                </div>
            </div>
        </div>
    );
};

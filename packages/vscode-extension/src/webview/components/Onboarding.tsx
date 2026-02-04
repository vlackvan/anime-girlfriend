import React, { useState, useEffect } from 'react';
import { Character } from '../personality/types';
import { getCharacter, getAvailableCharacters } from '../../characters';

interface OnboardingProps {
    onCharacterSelect: (character: Character) => void;
}

// Crystalline SVG pattern for popup header left decoration
const CrystallineLeftPattern: React.FC = () => (
    <svg
        className="popup-crystalline-left"
        width="120"
        height="100%"
        viewBox="0 0 120 50"
        preserveAspectRatio="xMinYMid slice"
    >
        <polygon points="0,0 40,15 20,35" fill="rgba(74,174,227,0.18)" />
        <polygon points="15,5 55,0 35,28" fill="rgba(100,200,240,0.14)" />
        <polygon points="0,20 30,40 10,50" fill="rgba(74,174,227,0.20)" />
        <polygon points="35,0 75,20 50,35" fill="rgba(120,210,245,0.12)" />
        <polygon points="25,25 65,35 45,50" fill="rgba(74,174,227,0.16)" />
        <polygon points="55,5 95,0 75,30" fill="rgba(100,200,240,0.10)" />
        <polygon points="70,15 110,25 90,50" fill="rgba(74,174,227,0.08)" />
        {/* Noise simulation */}
        <polygon points="8,12 12,16 6,18" fill="rgba(255,255,255,0.3)" />
        <polygon points="32,22 38,18 35,28" fill="rgba(255,255,255,0.25)" />
    </svg>
);

// Crystalline SVG pattern for popup body right decoration
const CrystallineRightPattern: React.FC = () => (
    <svg
        className="popup-crystalline-right"
        width="150"
        height="150"
        viewBox="0 0 150 150"
        preserveAspectRatio="xMaxYMax slice"
    >
        <polygon points="150,150 100,125 125,90" fill="rgba(74,174,227,0.10)" />
        <polygon points="150,125 90,100 115,65" fill="rgba(100,200,240,0.08)" />
        <polygon points="140,150 75,140 100,100" fill="rgba(74,174,227,0.12)" />
        <polygon points="150,90 110,75 135,40" fill="rgba(120,210,245,0.06)" />
        <polygon points="125,150 60,125 90,90" fill="rgba(74,174,227,0.09)" />
        <polygon points="150,60 100,50 125,15" fill="rgba(100,200,240,0.05)" />
        <polygon points="110,140 50,110 80,75" fill="rgba(74,174,227,0.07)" />
    </svg>
);

export const Onboarding: React.FC<OnboardingProps> = ({ onCharacterSelect }) => {
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [showCinematicOverlay, setShowCinematicOverlay] = useState(true);
    const availableCharacters = getAvailableCharacters();

    // Hide cinematic overlay after 3 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowCinematicOverlay(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    const handleCharacterClick = (character: Character) => {
        setSelectedCharacter(character);
    };

    const handleConfirmSelection = () => {
        if (selectedCharacter) {
            onCharacterSelect(selectedCharacter);
        }
    };

    return (
        <div className="onboarding-fullscreen">
            {/* Cinematic Intro Overlay */}
            {showCinematicOverlay && (
                <div className="cinematic-overlay">
                    <h1 className="cinematic-title">당신의 코딩을 같이할 여자친구를 골라보세요</h1>
                </div>
            )}

            {/* Full-screen side-by-side character images */}
            <div className="character-carousel">
                {availableCharacters.map((characterId) => {
                    const character = getCharacter(characterId);
                    return (
                        <div
                            key={characterId}
                            className={`character-panel ${selectedCharacter === characterId ? 'selected' : ''}`}
                            onClick={() => handleCharacterClick(characterId)}
                        >
                            <img
                                src={window.assetBaseUri?.[`${characterId}Portrait`] || window.assetBaseUri?.[characterId] || ''}
                                alt={character.config.name}
                                className="character-portrait"
                            />
                        </div>
                    );
                })}
            </div>

            {/* Popup box - only appears when character is selected */}
            {selectedCharacter && (
                <div className="character-popup-box">
                    {/* Popup Header */}
                    <div className="popup-header">
                        <CrystallineLeftPattern />
                        <div className="popup-header-content">
                            <h2>{getCharacter(selectedCharacter).config.name}</h2>
                        </div>
                        <div className="popup-header-overlay" />
                    </div>

                    {/* Popup Body */}
                    <div className="popup-body">
                        <CrystallineRightPattern />
                        <div className="popup-content">
                            <p>{getCharacter(selectedCharacter).config.description}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Select button - fixed at bottom right, only appears when character is selected */}
            {selectedCharacter && (
                <button
                    className="select-character-btn"
                    onClick={handleConfirmSelection}
                >
                    <span>선택하기</span>
                </button>
            )}
        </div>
    );
};

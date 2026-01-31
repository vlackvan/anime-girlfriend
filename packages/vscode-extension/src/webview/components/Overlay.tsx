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
            "Hmph! I-It's not like I'm impressed or anything... but well done!",
            "You actually solved it?! ...I mean, of course you did. I believed in you!",
            "See? I knew you had it in you. Don't let it go to your head though!"
        ],
        chihiro: [
            "Excellent work! Your logical approach paid off.",
            "Problem solved successfully. Your debugging skills are improving.",
            "Great job! Let's analyze what you learned from this problem."
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

                <h1>Problem #{problemId} Solved!</h1>

                <p className="congrats-message">"{randomMessage}"</p>

                <p className="tap-hint">Tap anywhere to continue</p>
            </div>
        </div>
    );
};

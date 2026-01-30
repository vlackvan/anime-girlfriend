import React, { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { SurveyForm } from './components/SurveyForm';
import { Chat } from './components/Chat';
import { Overlay } from './components/Overlay';
import { Character, UserProfile } from './personality/types';

declare global {
    interface Window {
        vscode: {
            postMessage: (message: any) => void;
        };
        assetBaseUri: {
            aru: string;
            chihiro: string;
        };
    }
}

type AppStep = 'character' | 'survey' | 'chat';

export const App: React.FC = () => {
    const [step, setStep] = useState<AppStep>('character');
    const [character, setCharacter] = useState<Character | undefined>();
    const [profile, setProfile] = useState<UserProfile | undefined>();
    const [showOverlay, setShowOverlay] = useState(false);
    const [overlayProblemId, setOverlayProblemId] = useState('');

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.type === 'showOverlay') {
                setOverlayProblemId(message.problemId);
                setShowOverlay(true);

                // Auto-hide after 3 seconds
                setTimeout(() => {
                    setShowOverlay(false);
                }, 3000);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleCharacterSelect = (selected: Character) => {
        setCharacter(selected);
        setStep('survey');
    };

    const handleSurveyComplete = (userProfile: UserProfile) => {
        setProfile(userProfile);
        setStep('chat');
    };

    return (
        <div className="app">
            {showOverlay && character && (
                <Overlay
                    character={character}
                    problemId={overlayProblemId}
                    onClose={() => setShowOverlay(false)}
                />
            )}

            {step === 'character' && (
                <Onboarding onCharacterSelect={handleCharacterSelect} />
            )}

            {step === 'survey' && character && (
                <SurveyForm
                    character={character}
                    onComplete={handleSurveyComplete}
                />
            )}

            {step === 'chat' && character && profile && (
                <Chat
                    character={character}
                    profile={profile}
                />
            )}
        </div>
    );
};

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

type AppStep = 'loading' | 'character' | 'survey' | 'chat';

export const App: React.FC = () => {
    const [step, setStep] = useState<AppStep>('loading');
    const [character, setCharacter] = useState<Character | undefined>();
    const [profile, setProfile] = useState<UserProfile | undefined>();
    const [showOverlay, setShowOverlay] = useState(false);
    const [overlayProblemId, setOverlayProblemId] = useState('');

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.type) {
                case 'initialState':
                    // Handle initial state from extension
                    if (message.data.hasProfile && message.data.profile) {
                        // Profile exists, skip to chat
                        const savedProfile = message.data.profile;
                        setCharacter(savedProfile.character);
                        setProfile({
                            bfi: savedProfile.bfi,
                            pvq: savedProfile.pvq,
                            character: savedProfile.character,
                            analysis: savedProfile.personalitySummary
                        });
                        setStep('chat');
                    } else {
                        // No profile, start onboarding
                        setStep('character');
                    }
                    break;

                case 'showOverlay':
                    setOverlayProblemId(message.problemId);
                    setShowOverlay(true);
                    setTimeout(() => {
                        setShowOverlay(false);
                    }, 3000);
                    break;

                case 'command':
                    if (message.command === 'goToStep') {
                        setStep(message.data as AppStep);
                    }
                    break;

                case 'profileSaved':
                    console.log('[App] Profile saved successfully');
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        // Notify extension that webview is ready
        window.vscode.postMessage({ type: 'ready' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleCharacterSelect = (selected: Character) => {
        setCharacter(selected);
        setStep('survey');
    };

    const handleSurveyComplete = (userProfile: UserProfile) => {
        setProfile(userProfile);

        // Save profile to extension
        window.vscode.postMessage({
            type: 'saveProfile',
            data: userProfile
        });

        setStep('chat');
    };

    // Loading state
    if (step === 'loading') {
        return (
            <div className="app loading">
                <div className="loading-spinner">Loading...</div>
            </div>
        );
    }

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


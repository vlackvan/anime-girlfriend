import React, { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { DemographicsForm, Demographics } from './components/DemographicsForm';
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
            [key: string]: string; // Dynamic character assets: { aru, aruPortrait, chihiro, chihiroPortrait, ... }
            bongoIdle: string;
            bongoLeft: string;
            bongoRight: string;
            loading: string;
        };
    }
}

type AppStep = 'loading' | 'character' | 'demographics' | 'survey' | 'chat';

export const App: React.FC = () => {
    const [step, setStep] = useState<AppStep>('loading');
    const [character, setCharacter] = useState<Character | undefined>();
    const [demographics, setDemographics] = useState<Demographics | undefined>();
    const [profile, setProfile] = useState<UserProfile | undefined>();
    const [showOverlay, setShowOverlay] = useState(false);
    const [overlayProblemId, setOverlayProblemId] = useState('');
    const [overlayResultText, setOverlayResultText] = useState('');
    const [overlayStatus, setOverlayStatus] = useState<'accepted' | 'wrong_answer' | 'time_limit' | 'memory_limit' | 'runtime_error' | 'compile_error' | 'output_limit' | 'presentation_error' | 'unknown'>('accepted');
    const [overlayMemory, setOverlayMemory] = useState('');
    const [overlayTime, setOverlayTime] = useState('');

    const [historyLength, setHistoryLength] = useState(0);

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
                        setDemographics(savedProfile.demographics);
                        setProfile({
                            character: savedProfile.character,
                            demographics: savedProfile.demographics,
                            essays: savedProfile.essays,
                            analysis: savedProfile.analysis,
                            coreMemories: savedProfile.coreMemories,
                            solvedAcData: savedProfile.solvedAcData,
                            isFirstMeeting: false
                        });
                        setHistoryLength(message.data.historyLength || 0);
                        setStep('chat');
                    } else {
                        // No profile, start onboarding
                        setStep('character');
                    }
                    break;

                case 'showOverlay':
                    setOverlayProblemId(message.problemId);
                    setOverlayResultText(message.resultText || '');
                    setOverlayStatus(message.status || 'accepted');
                    setOverlayMemory(message.memory || '');
                    setOverlayTime(message.time || '');
                    setShowOverlay(true);
                    setTimeout(() => {
                        setShowOverlay(false);
                    }, 4000);
                    break;

                case 'showJudgeResult':
                    setOverlayProblemId(message.problemId);
                    setOverlayResultText(message.resultText || '');
                    setOverlayStatus(message.status || 'unknown');
                    setOverlayMemory(message.memory || '');
                    setOverlayTime(message.time || '');
                    setShowOverlay(true);
                    setTimeout(() => {
                        setShowOverlay(false);
                    }, 4000);
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
        setStep('demographics');
    };

    const handleDemographicsComplete = (demo: Demographics) => {
        setDemographics(demo);
        setStep('survey');
    };

    const handleDemographicsSkip = () => {
        setDemographics(undefined);
        setStep('survey');
    };

    const handleSurveyComplete = (userProfile: UserProfile) => {
        // Merge demographics into profile
        const completeProfile = {
            ...userProfile,
            demographics,
            isFirstMeeting: true, // Flag to indicate this is the first chat after onboarding
        };

        setProfile(completeProfile);

        // Save profile to extension
        window.vscode.postMessage({
            type: 'saveProfile',
            data: completeProfile
        });

        setStep('chat');
    };

    // Loading state
    if (step === 'loading') {
        return (
            <div className="app loading">
                <div className="loading-container">
                    <img
                        src={window.assetBaseUri.loading}
                        alt="Loading"
                        className="loading-image"
                    />
                    <div className="loading-text">Loading...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="app">
            {showOverlay && character && (
                <Overlay
                    character={character}
                    problemId={overlayProblemId}
                    resultText={overlayResultText}
                    status={overlayStatus}
                    memory={overlayMemory}
                    time={overlayTime}
                    onClose={() => setShowOverlay(false)}
                />
            )}

            {step === 'character' && (
                <Onboarding onCharacterSelect={handleCharacterSelect} />
            )}

            {step === 'demographics' && (
                <DemographicsForm
                    onComplete={handleDemographicsComplete}
                    onSkip={handleDemographicsSkip}
                />
            )}

            {step === 'survey' && character && (
                <SurveyForm
                    character={character}
                    demographics={demographics}
                    onComplete={handleSurveyComplete}
                />
            )}

            {step === 'chat' && character && profile && (
                <Chat
                    character={character}
                    profile={profile}
                    historyLength={historyLength}
                />
            )}
        </div>
    );
};


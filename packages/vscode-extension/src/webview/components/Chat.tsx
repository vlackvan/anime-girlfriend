import React, { useState, useRef, useEffect } from 'react';
import { Character, UserProfile } from '../personality/types';
import { BongoCat } from './BongoCat';
import { ProblemSelector } from './ProblemSelector';
import { RecommendedQuestions, CodingState, HintPhase } from './RecommendedQuestions';
import { getCharacter } from '../../characters';

interface Message {
    id: string;
    author: 'user' | 'bot';
    content: string;
    isStreaming?: boolean;
}

interface ChatProps {
    character: Character;
    profile: UserProfile;
    historyLength?: number;
}

export const Chat: React.FC<ChatProps> = ({ character, profile, historyLength = 0 }) => {
    // Get character definition
    const characterDef = getCharacter(character);

    // Generate initial greeting message
    const [messages, setMessages] = useState<Message[]>([]);
    const [isBongoCatOpen, setIsBongoCatOpen] = useState(true);
    const [currentProblem, setCurrentProblem] = useState<string | null>(null);
    const [showProblemSelector, setShowProblemSelector] = useState(false);
    const [codingState, setCodingState] = useState<CodingState>('NOT_STARTED');
    const [hintLevel, setHintLevel] = useState<number>(0);
    const [hintPhase, setHintPhase] = useState<HintPhase>('DEFAULT');

    useEffect(() => {
        console.log('Chat component mounted v2.1 - checking icons');

        // Request current problem from backend
        window.vscode.postMessage({ type: 'getCurrentProblem' });
    }, []);

    // Trigger initial greeting logic
    useEffect(() => {
        // Case 1: First Meeting (just finished onboarding)
        if (profile.isFirstMeeting && messages.length === 0) {
            window.vscode.postMessage({
                type: 'triggerGreeting'
            });
        }
        // Case 2: Welcome Back (Returning User, New Session)
        // If it's NOT the first meeting, and we have no local messages, and backend history is empty
        else if (!profile.isFirstMeeting && messages.length === 0 && historyLength === 0) {
            window.vscode.postMessage({
                type: 'welcomeBack'
            });
        }
    }, [profile.isFirstMeeting, historyLength]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Image Input Handler
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // Heart Button Handler
    const handleHeartClick = () => {
        if (isLoading) return;
        setIsLoading(true);
        // Send special heart action
        window.vscode.postMessage({
            type: 'heartAction'
        });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.type) {
                case 'currentProblem':
                    setCurrentProblem(message.problemId || null);
                    // Show selector if no current problem
                    if (!message.problemId) {
                        setShowProblemSelector(true);
                    }
                    break;

                case 'botMessageStart':
                    // Start a new streaming message
                    setStreamingMessageId(message.id);
                    setMessages(prev => [...prev, {
                        id: message.id,
                        author: 'bot',
                        content: '',
                        isStreaming: true
                    }]);
                    break;

                case 'botMessageToken':
                    // Append token to streaming message
                    setMessages(prev => prev.map(msg =>
                        msg.id === streamingMessageId
                            ? { ...msg, content: msg.content + message.token }
                            : msg
                    ));
                    break;

                case 'botMessageComplete':
                    // Mark streaming as complete
                    setMessages(prev => {
                        // If content is empty, remove the streaming message instead
                        if (!message.content || message.content.trim().length === 0) {
                            return prev.filter(msg => msg.id !== streamingMessageId);
                        }
                        return prev.map(msg =>
                            msg.id === streamingMessageId
                                ? { ...msg, content: message.content, isStreaming: false }
                                : msg
                        );
                    });
                    setStreamingMessageId(null);
                    setIsLoading(false);
                    break;

                case 'botMessageSplit':
                    // Add a new split message (multiple messages for long responses)
                    const splitMessageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    setMessages(prev => {
                        // Remove the streaming message if it exists (whether empty or not)
                        const filtered = prev.filter(msg => msg.id !== streamingMessageId);
                        // Only add message if content is not empty
                        if (message.content && message.content.trim().length > 0) {
                            return [...filtered, {
                                id: splitMessageId,
                                author: 'bot',
                                content: message.content,
                                isStreaming: false
                            }];
                        }
                        return filtered;
                    });
                    if (message.isLast) {
                        setStreamingMessageId(null);
                        setIsLoading(false);
                    }
                    break;

                case 'botMessageError':
                    // Handle error
                    setMessages(prev => {
                        // If there's a streaming message, update it with error
                        if (streamingMessageId) {
                            return prev.map(msg =>
                                msg.id === streamingMessageId
                                    ? { ...msg, content: `❌ Error: ${message.error}`, isStreaming: false }
                                    : msg
                            );
                        }
                        // Otherwise add a new error message
                        return [...prev, {
                            id: Date.now().toString(),
                            author: 'bot',
                            content: `❌ Error: ${message.error}`
                        }];
                    });
                    setStreamingMessageId(null);
                    setIsLoading(false);
                    break;

                case 'botMessage':
                    // Legacy: non-streaming message
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        author: 'bot',
                        content: message.content
                    }]);
                    setIsLoading(false);
                    break;

                case 'codingState':
                    // Update coding state from backend
                    if (message.data && message.data.state) {
                        setCodingState(message.data.state);
                    }
                    break;

                case 'hintLevel':
                    // Update hint level from backend - only reset phase if level CHANGES
                    if (typeof message.level === 'number') {
                        setHintLevel(prevLevel => {
                            // Only reset phase to DEFAULT if level actually increased
                            if (message.level !== prevLevel) {
                                setHintPhase('DEFAULT');
                            }
                            return message.level;
                        });
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [streamingMessageId]);

    const handleSend = () => {
        if ((!inputValue.trim() && !selectedImage) || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            author: 'user',
            content: inputValue.trim(),
            // We could display the image in the chat history too if we want, but for now just sending it.
            // Ideally we'd add an 'image' property to Message interface to show it in the bubble.
        };

        setMessages(prev => [...prev, userMessage]);

        // Send to extension
        window.vscode.postMessage({
            type: 'sendMessage',
            content: userMessage.content,
            images: selectedImage ? [selectedImage] : undefined
        });

        setInputValue('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        setSelectedImage(null);
        setIsLoading(true);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const toggleBongoCat = () => {
        setIsBongoCatOpen(prev => !prev);
    };

    const handleProblemSelect = (problemId: string) => {
        setCurrentProblem(problemId);
        setShowProblemSelector(false);
        window.vscode.postMessage({
            type: 'setCurrentProblem',
            problemId
        });
    };

    const handleChangeProblem = () => {
        setShowProblemSelector(true);
    };

    // Handle recommended question click
    const handleQuestionClick = (question: string, shouldAdvanceHint: boolean, advancePhase: boolean) => {
        if (isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            author: 'user',
            content: question,
        };

        setMessages(prev => [...prev, userMessage]);

        // If advancePhase is true, move from DEFAULT to ADVANCE phase
        if (advancePhase) {
            setHintPhase('ADVANCE');
        }

        // If shouldAdvanceHint is true (clicked advance button), reset phase to DEFAULT for next level
        if (shouldAdvanceHint) {
            setHintPhase('DEFAULT');
        }

        window.vscode.postMessage({
            type: 'sendMessage',
            content: question,
            shouldAdvanceHint: shouldAdvanceHint
        });

        setIsLoading(true);
    };

    return (
        <div className={`chat-wrapper ${isBongoCatOpen ? '' : 'bongo-closed'}`}>
            <div className="chat">
                <div className="chat-header">
                    <div className="chat-title">🍑MomoTalk</div>
                    <div className="chat-header-info">
                        <img
                            src={window.assetBaseUri?.[character] || ''}
                            alt={character}
                            className="avatar"
                        />
                        <span className="name">{characterDef.config.name}</span>
                        <div className="status-indicator">
                            <span className="status-dot"></span>
                            <span className="status-text">온라인</span>
                        </div>
                        {currentProblem && (
                            <div className="current-problem-badge">
                                <span className="problem-text">문제 #{currentProblem}</span>
                                <button
                                    className="change-problem-btn"
                                    onClick={handleChangeProblem}
                                    title="문제 변경"
                                >
                                    변경
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`message ${msg.author}`}>
                            {msg.author === 'bot' && (
                                <>
                                    <img
                                        src={window.assetBaseUri?.[character] || ''}
                                        alt={character}
                                        className="avatar"
                                    />
                                    <div className="message-content">
                                        <span className="name">{characterDef.config.name}</span>
                                        <div className={`bubble ${msg.isStreaming ? 'streaming' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                                            {msg.content || (msg.isStreaming && '...')}
                                        </div>
                                    </div>
                                </>
                            )}
                            {msg.author === 'user' && (
                                <div className={`bubble ${msg.isStreaming ? 'streaming' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                                    {msg.content}
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && !streamingMessageId && (
                        <div className="message bot">
                            <img
                                src={window.assetBaseUri?.[character] || ''}
                                alt={character}
                                className="avatar"
                            />
                            <div className="message-content">
                                <span className="name">{characterDef.config.name}</span>
                                <div className="bubble typing">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {selectedImage && (
                    <div className="image-preview">
                        <img src={selectedImage} alt="Selected" />
                        <button className="remove-image" onClick={() => setSelectedImage(null)}>×</button>
                    </div>
                )}

                {/* Recommended Questions */}
                {currentProblem && (
                    <RecommendedQuestions
                        codingState={codingState}
                        hintLevel={hintLevel}
                        hintPhase={hintPhase}
                        onQuestionClick={handleQuestionClick}
                        disabled={isLoading}
                    />
                )}

                <div className="input-area new-layout">
                    <div className="left-controls">
                        <label className="icon-btn image-btn" title="사진 첨부">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                                style={{ display: 'none' }}
                            />
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                        </label>
                    </div>

                    <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            // Auto-adjust height
                            if (textareaRef.current) {
                                textareaRef.current.style.height = 'auto';
                                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
                            }
                        }}
                        onKeyPress={handleKeyPress}
                        placeholder="메시지를 입력하세요..."
                        rows={1}
                        disabled={isLoading}
                    />

                    <div className="right-controls">
                        <button
                            className="icon-btn heart-btn"
                            onClick={handleHeartClick}
                            disabled={isLoading}
                            title="사랑의 메시지 요청"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bongo Cat Toggle Button */}
            <button className="bongo-toggle-btn" onClick={toggleBongoCat} title={isBongoCatOpen ? '접기' : '펼치기'}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {isBongoCatOpen ? (
                        // Down arrow (close/collapse)
                        <polyline points="6 9 12 15 18 9"></polyline>
                    ) : (
                        // Up arrow with line (open/expand) - eject icon style
                        <>
                            <polyline points="6 11 12 5 18 11"></polyline>
                            <line x1="6" y1="19" x2="18" y2="19"></line>
                        </>
                    )}
                </svg>
            </button>

            {/* Collapsible Bongo Cat Section */}
            <div className={`bongo-cat-section ${isBongoCatOpen ? 'open' : 'closed'}`}>
                <BongoCat />
            </div>

            {/* Problem Selector Modal */}
            {showProblemSelector && (
                <ProblemSelector
                    onSelect={handleProblemSelect}
                    onClose={() => setShowProblemSelector(false)}
                    userTier={profile.solvedAcData && 'tier' in profile.solvedAcData ? profile.solvedAcData.tier : 0}
                    solvedCount={profile.solvedAcData && 'solvedCount' in profile.solvedAcData ? profile.solvedAcData.solvedCount : 0}
                />
            )}
        </div>
    );
};


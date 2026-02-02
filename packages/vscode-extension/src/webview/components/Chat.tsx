import React, { useState, useRef, useEffect } from 'react';
import { Character, UserProfile } from '../personality/types';

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
    // Generate initial greeting message
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        console.log('Chat component mounted v2.1 - checking icons');
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
    const [isListening, setIsListening] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Voice Input Handler
    const toggleVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window)) {
            // Fallback or alert if not supported
            alert('이 브라우저에서는 음성 인식을 지원하지 않습니다.');
            return;
        }

        if (isListening) {
            setIsListening(false);
            // Stop logic is handled by the recognition instance if we kept it in ref, 
            // but for simplicity let's assume valid browser support handling
            return;
        }

        setIsListening(true);
        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = 'ko-KR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
            setIsListening(false);
        };

        recognition.onerror = () => {
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
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
                    setMessages(prev => prev.map(msg =>
                        msg.id === streamingMessageId
                            ? { ...msg, content: message.content, isStreaming: false }
                            : msg
                    ));
                    setStreamingMessageId(null);
                    setIsLoading(false);
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
        setSelectedImage(null);
        setIsLoading(true);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat">
            <div className="chat-header">
                <div className="chat-title">ANIME GIRLFRIEND: CHAT</div>
                <div className="chat-header-info">
                    <img
                        src={character === 'aru' ? window.assetBaseUri?.aru : window.assetBaseUri?.chihiro}
                        alt={character}
                        className="avatar"
                    />
                    <span className="name">{character === 'aru' ? 'Aru' : 'Chihiro'}</span>
                    <div className="status-indicator">
                        <span className="status-dot"></span>
                        <span className="status-text">온라인</span>
                    </div>
                </div>
            </div>

            <div className="messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.author}`}>
                        {msg.author === 'bot' && (
                            <>
                                <img
                                    src={character === 'aru' ? window.assetBaseUri?.aru : window.assetBaseUri?.chihiro}
                                    alt={character}
                                    className="avatar"
                                />
                                <div className="message-content">
                                    <span className="name">{character === 'aru' ? 'Aru' : 'Chihiro'}</span>
                                    <div className={`bubble ${msg.isStreaming ? 'streaming' : ''}`}>
                                        {msg.content || (msg.isStreaming && '...')}
                                    </div>
                                </div>
                            </>
                        )}
                        {msg.author === 'user' && (
                            <div className={`bubble ${msg.isStreaming ? 'streaming' : ''}`}>
                                {msg.content}
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && !streamingMessageId && (
                    <div className="message bot">
                        <img
                            src={character === 'aru' ? window.assetBaseUri?.aru : window.assetBaseUri?.chihiro}
                            alt={character}
                            className="avatar"
                        />
                        <div className="message-content">
                            <span className="name">{character === 'aru' ? 'Aru' : 'Chihiro'}</span>
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
            <div className="input-area new-layout">
                <div className="left-controls">
                    <button
                        className={`icon-btn mic-btn ${isListening ? 'listening' : ''}`}
                        onClick={toggleVoiceInput}
                        title="음성 입력"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                    </button>
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
                    onChange={(e) => setInputValue(e.target.value)}
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
    );
};


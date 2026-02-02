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
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        if (!inputValue.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            author: 'user',
            content: inputValue.trim()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        // Send to extension
        window.vscode.postMessage({
            type: 'sendMessage',
            content: userMessage.content
        });
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
                <img
                    src={character === 'aru' ? window.assetBaseUri?.aru : window.assetBaseUri?.chihiro}
                    alt={character}
                    className="avatar"
                />
                <span className="name">{character === 'aru' ? 'Aru' : 'Chihiro'}</span>
                <span className="status">
                    {isLoading ? '💭 생각 중...' : '🟢 온라인'}
                </span>
            </div>

            <div className="messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.author}`}>
                        <div className={`bubble ${msg.isStreaming ? 'streaming' : ''}`}>
                            {msg.content || (msg.isStreaming && '...')}
                        </div>
                    </div>
                ))}
                {isLoading && !streamingMessageId && (
                    <div className="message bot">
                        <div className="bubble typing">
                            <span>.</span><span>.</span><span>.</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
                <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="메시지를 입력하세요..."
                    rows={1}
                    disabled={isLoading}
                />
                <button onClick={handleSend} disabled={isLoading || !inputValue.trim()}>
                    전송
                </button>
            </div>
        </div>
    );
};


import React, { useState, useRef, useEffect } from 'react';
import { Character, UserProfile } from '../personality/types';

interface Message {
    id: string;
    author: 'user' | 'bot';
    content: string;
}

interface ChatProps {
    character: Character;
    profile: UserProfile;
}

export const Chat: React.FC<ChatProps> = ({ character, profile }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            author: 'bot',
            content: character === 'aru'
                ? "Hmph! So you finally decided to show up? Well, I suppose I'll help you... but don't expect me to go easy on you!"
                : "Hello! I'm ready to help you debug your code. Let's analyze the problem systematically."
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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

            if (message.type === 'botMessage') {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    author: 'bot',
                    content: message.content
                }]);
                setIsLoading(false);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

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
            </div>

            <div className="messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.author}`}>
                        <div className="bubble">{msg.content}</div>
                    </div>
                ))}
                {isLoading && (
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
                    placeholder="Type your message..."
                    rows={1}
                />
                <button onClick={handleSend} disabled={isLoading || !inputValue.trim()}>
                    Send
                </button>
            </div>
        </div>
    );
};

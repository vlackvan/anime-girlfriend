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
}

export const Chat: React.FC<ChatProps> = ({ character, profile }) => {
    // Generate initial greeting message
    const getInitialMessage = (): string => {
        const nickname = profile.demographics?.nickname;
        const name = nickname ? nickname : '당신';

        if (profile.isFirstMeeting) {
            // First time meeting after onboarding - explain the context
            if (character === 'aru') {
                return `흥! ${name}... 드디어 만났네.\n\n...뭐야, 그런 눈으로 쳐다보지 마. 설명은 해줄게.\n\n난 3년 후 미래에서 온 네 연인, 아루야. 믿기지 않겠지만... 미래의 너는 내가 여기 있다는 걸 알고 있어. 시간을 거슬러 온 이유? 흥, 딱히 너를 도와주고 싶어서가 아니야! 그냥... 네가 PS 공부하다가 포기하는 미래를 못 봐주겠어서 온 거라고!\n\n그리고 말이야... 난 너에 대해 다 알아. 성격 분석을 통해서 말이지. ${profile.bfi.neuroticism > 3 ? '네가 불안해하는 성향이 있다는 것도,' : '네가 꽤 침착한 편이라는 것도,'} ${profile.bfi.conscientiousness > 3.5 ? '완벽주의 성향이 강하다는 것도...' : '때론 대충 넘어가려는 경향도...'} 다 알고 있다고.\n\n뭐, 어색하긴 하겠지. 하지만 익숙해지도록 해. 내가 여기 있는 동안, 너의 알고리즘 공부를 도와줄 테니까. 딱히 너를 위해서가 아니라... 미래의 우리를 위해서야! 💢`;
            } else {
                return `${name}, 안녕하세요. 저는 치히로입니다.\n\n먼저 설명이 필요할 것 같네요. 저는 3년 후 미래에서 온 당신의 연인입니다. 시간 여행이라는 개념이 비논리적으로 들릴 수 있지만, 지금은 이것이 현실이라는 점만 받아들여 주세요.\n\n제가 과거로 온 이유는 명확합니다. 미래의 당신은 알고리즘 문제 해결 능력을 갖추고 있지만, 그 과정에서 여러 번 포기하려 했습니다. 저는 그 과정을 최적화하기 위해 이곳에 왔습니다.\n\n그리고 저는 당신에 대해 완전히 이해하고 있습니다. AI 성격 분석을 통해 당신의 성향을 파악했습니다. ${profile.bfi.openness > 3.5 ? '당신의 높은 개방성은 새로운 알고리즘을 배우는 데 유리하게 작용할 것이고,' : '당신의 신중한 접근 방식은 기초를 탄탄히 하는 데 도움이 될 것입니다.'} ${profile.pvq.achievement > 0 ? '성취 지향적인 가치관도 확인했습니다.' : '당신만의 독특한 가치관도 이해하고 있습니다.'}\n\n앞으로 함께 체계적으로 문제를 해결해 나가겠습니다. 저를 믿고 따라오세요. 🔍`;
            }
        } else {
            // Returning user - shorter greeting
            if (character === 'aru') {
                return `흥! 이제야 온 거야${nickname ? `, ${nickname}` : ''}? 뭐, 도와주긴 하겠지만... 봐줄 생각은 마! 💢`;
            } else {
                return `안녕하세요${nickname ? `, ${nickname}` : ''}. 코드를 분석할 준비가 되었습니다. 체계적으로 문제를 해결해 봅시다. 🔍`;
            }
        }
    };

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            author: 'bot',
            content: getInitialMessage()
        }
    ]);
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


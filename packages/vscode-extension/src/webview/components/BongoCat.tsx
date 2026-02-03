import React, { useState, useEffect, useRef } from 'react';

export const BongoCat: React.FC = () => {
    const [currentImage, setCurrentImage] = useState<'idle' | 'left' | 'right'>('idle');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isLeftRef = useRef(true);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.type === 'bongoCatStroke') {
                // Clear any existing timeout
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                }

                // Toggle between left and right paw
                setCurrentImage(isLeftRef.current ? 'left' : 'right');
                isLeftRef.current = !isLeftRef.current;

                // Reset to idle after 200ms of inactivity
                timeoutRef.current = setTimeout(() => {
                    setCurrentImage('idle');
                }, 200);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const getImageSrc = () => {
        switch (currentImage) {
            case 'left':
                return window.assetBaseUri?.bongoLeft;
            case 'right':
                return window.assetBaseUri?.bongoRight;
            default:
                return window.assetBaseUri?.bongoIdle;
        }
    };

    return (
        <div className="bongo-cat-container">
            <img
                src={getImageSrc()}
                alt="Bongo Cat"
                className="bongo-cat-image"
            />
        </div>
    );
};

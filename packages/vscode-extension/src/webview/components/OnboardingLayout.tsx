import React from 'react';

interface OnboardingLayoutProps {
    title: string;
    children: React.ReactNode;
}

// Crystalline SVG pattern for left header decoration
const CrystallineLeftPattern: React.FC = () => (
    <svg
        className="crystalline-left-pattern"
        width="200"
        height="100%"
        viewBox="0 0 200 80"
        preserveAspectRatio="xMinYMid slice"
    >
        {/* Large triangular shards */}
        <polygon points="0,0 60,20 30,50" fill="rgba(74,174,227,0.15)" />
        <polygon points="20,10 80,0 50,40" fill="rgba(100,200,240,0.12)" />
        <polygon points="0,30 40,60 10,80" fill="rgba(74,174,227,0.18)" />
        <polygon points="50,0 100,30 70,50" fill="rgba(120,210,245,0.10)" />
        <polygon points="30,40 90,50 60,80" fill="rgba(74,174,227,0.14)" />
        <polygon points="70,10 130,0 100,40" fill="rgba(100,200,240,0.08)" />
        <polygon points="80,30 140,50 110,80" fill="rgba(74,174,227,0.12)" />
        <polygon points="100,0 160,20 130,50" fill="rgba(120,210,245,0.10)" />
        <polygon points="120,20 180,10 150,60" fill="rgba(74,174,227,0.08)" />
        <polygon points="140,0 200,30 170,50" fill="rgba(100,200,240,0.06)" />
        {/* Noise overlay simulation with tiny triangles */}
        <polygon points="10,20 15,25 8,28" fill="rgba(255,255,255,0.3)" />
        <polygon points="45,35 52,30 48,42" fill="rgba(255,255,255,0.2)" />
        <polygon points="75,15 82,20 78,28" fill="rgba(255,255,255,0.25)" />
    </svg>
);

// Crystalline SVG pattern for right body decoration
const CrystallineRightPattern: React.FC = () => (
    <svg
        className="crystalline-right-pattern"
        width="300"
        height="300"
        viewBox="0 0 300 300"
        preserveAspectRatio="xMaxYMax slice"
    >
        {/* Large background shards */}
        <polygon points="300,300 200,250 250,180" fill="rgba(74,174,227,0.08)" />
        <polygon points="300,250 180,200 230,130" fill="rgba(100,200,240,0.06)" />
        <polygon points="280,300 150,280 200,200" fill="rgba(74,174,227,0.10)" />
        <polygon points="300,180 220,150 270,80" fill="rgba(120,210,245,0.05)" />
        <polygon points="250,300 120,250 180,180" fill="rgba(74,174,227,0.07)" />
        <polygon points="300,120 200,100 250,30" fill="rgba(100,200,240,0.04)" />
        <polygon points="220,280 100,220 160,150" fill="rgba(74,174,227,0.06)" />
        <polygon points="300,60 180,50 230,0" fill="rgba(120,210,245,0.03)" />
        {/* Medium shards */}
        <polygon points="280,220 230,180 260,140" fill="rgba(74,174,227,0.08)" />
        <polygon points="240,260 190,220 220,180" fill="rgba(100,200,240,0.06)" />
        <polygon points="300,200 250,160 280,120" fill="rgba(74,174,227,0.05)" />
    </svg>
);

export const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({ title, children }) => {
    return (
        <div className="onboarding-layout">
            {/* Header Bar */}
            <header className="onboarding-header">
                <CrystallineLeftPattern />
                <div className="header-title-container">
                    <h1 className="header-title">{title}</h1>
                </div>
                {/* Subtle gradient overlay for texture */}
                <div className="header-texture-overlay" />
            </header>

            {/* Body Container */}
            <main className="onboarding-body">
                <CrystallineRightPattern />
                <div className="onboarding-content">
                    {children}
                </div>
            </main>
        </div>
    );
};

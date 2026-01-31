// Character types
export type Character = 'aru' | 'chihiro';

// BFI-2-S (Big Five Inventory - Short)
export interface BFIScores {
    extraversion: number;      // 1-5
    agreeableness: number;     // 1-5
    conscientiousness: number; // 1-5
    neuroticism: number;       // 1-5 (Negative Emotionality)
    openness: number;          // 1-5 (Open-Mindedness)
}

// PVQ (Portrait Values Questionnaire) Full 10 Values
export interface PVQScores {
    universalism: number;
    benevolence: number;
    tradition: number;
    conformity: number;
    security: number;
    power: number;
    achievement: number;
    hedonism: number;
    stimulation: number;
    selfDirection: number;
}

// Demographics
export interface Demographics {
    nickname?: string;
    ageRange: string;
    status: string;
    field: string;
}

// Combined user profile
export interface UserProfile {
    bfi: BFIScores;
    pvq: PVQScores;
    character: Character;
    demographics?: Demographics;
    analysis?: string; // CoD Pipeline Analysis
    isFirstMeeting?: boolean; // Flag for initial greeting after onboarding
}

// Survey question structure
export interface SurveyQuestion {
    id: number;
    text: string;
    trait: string;
    reversed?: boolean;
}

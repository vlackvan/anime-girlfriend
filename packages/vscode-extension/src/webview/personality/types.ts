// Character types
export type Character = 'aru' | 'chihiro';

// User Essays for Implicit Personality Extraction
export interface UserEssays {
    routine: string;  // Routine (C) -> Habits
    struggle: string; // Struggle (P via C) -> Neuroticism/Regulation
    goal: string;     // Goal (S) -> Values/Ambition
}

// Demographics
export interface Demographics {
    nickname?: string;
    ageRange: string;
    status: string;
    field: string;
}

// Combined user profile
export interface CoreMemories {
    selfIntro: string;
    futureVision: string;
    stressStrategy: string;
    happiness: string;
    sharedMemories: string[]; // 5 generated shared memories
}

export interface BFIScores {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
}

export interface PVQScores {
    selfDirection: number;
    power: number;
    universalism: number;
    achievement: number;
    security: number;
    stimulation: number;
    conformity: number;
    tradition: number;
    hedonism: number;
    benevolence: number;
}

export interface UserProfile {
    essays: UserEssays;
    character: Character;
    demographics?: Demographics;
    analysis?: string; // AI-generated personality analysis
    coreMemories?: CoreMemories; // New field
    solvedAcData?: any; // Solved.ac data for referenced in chat
    isFirstMeeting?: boolean; // Flag for initial greeting after onboarding
    bfi?: BFIScores;
    pvq?: PVQScores;
}

// Survey question structure
export interface SurveyQuestion {
    id: number;
    text: string;
    trait: string;
    reversed?: boolean;
}

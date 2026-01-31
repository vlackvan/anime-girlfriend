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
}

export interface UserProfile {
    essays: UserEssays;
    character: Character;
    demographics?: Demographics;
    analysis?: string; // AI-generated personality analysis
    coreMemories?: CoreMemories; // New field
    solvedAcData?: any; // Solved.ac data for referenced in chat
    isFirstMeeting?: boolean; // Flag for initial greeting after onboarding
}

// Survey question structure
export interface SurveyQuestion {
    id: number;
    text: string;
    trait: string;
    reversed?: boolean;
}

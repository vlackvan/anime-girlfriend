import * as vscode from 'vscode';
import { SolvedAcStats, SolvedAcManualInput } from './SolvedAcService';

// Demographics information
export interface Demographics {
    nickname?: string;
    ageRange: string;
    status: string;
    field: string;
}

// Stored user profile structure
export interface StoredUserProfile {
    character: 'aru' | 'chihiro';
    demographics?: Demographics;
    bfi: {
        extraversion: number;
        agreeableness: number;
        conscientiousness: number;
        neuroticism: number;
        openness: number;
    };
    pvq: {
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
    };
    personalitySummary?: string; // AI-generated personality analysis (from CoD + OpenAI)
    solvedAcData?: SolvedAcStats | SolvedAcManualInput; // Problem-solving context
    createdAt: string;
    updatedAt: string;
}

const PROFILE_KEY = 'anime-girlfriend.userProfile';

export class UserDataStore {
    private globalState: vscode.Memento;

    constructor(globalState: vscode.Memento) {
        this.globalState = globalState;
    }

    /**
     * Check if a user profile exists
     */
    hasProfile(): boolean {
        return this.globalState.get<StoredUserProfile>(PROFILE_KEY) !== undefined;
    }

    /**
     * Load the saved user profile
     */
    loadProfile(): StoredUserProfile | undefined {
        return this.globalState.get<StoredUserProfile>(PROFILE_KEY);
    }

    /**
     * Save user profile after onboarding completion
     */
    async saveProfile(profile: Omit<StoredUserProfile, 'createdAt' | 'updatedAt'>): Promise<void> {
        const now = new Date().toISOString();
        const existing = this.loadProfile();
        
        const storedProfile: StoredUserProfile = {
            ...profile,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };

        await this.globalState.update(PROFILE_KEY, storedProfile);
        console.log('[UserDataStore] Profile saved:', storedProfile.character);
    }

    /**
     * Update personality summary (from CoD pipeline)
     */
    async updatePersonalitySummary(summary: string): Promise<void> {
        const profile = this.loadProfile();
        if (profile) {
            profile.personalitySummary = summary;
            profile.updatedAt = new Date().toISOString();
            await this.globalState.update(PROFILE_KEY, profile);
            console.log('[UserDataStore] Personality summary updated');
        }
    }

    /**
     * Clear all stored data (reset)
     */
    async clearProfile(): Promise<void> {
        await this.globalState.update(PROFILE_KEY, undefined);
        console.log('[UserDataStore] Profile cleared');
    }
}

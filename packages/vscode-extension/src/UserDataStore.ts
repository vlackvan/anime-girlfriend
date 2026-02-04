import * as vscode from 'vscode';
import { SolvedAcStats, SolvedAcManualInput } from './SolvedAcService';
import { CharacterId } from './characters';

// Demographics information
export interface Demographics {
    nickname?: string;
    ageRange: string;
    status: string;
    field: string;
}

import { CoreMemories } from './webview/personality/types';

// Stored user profile structure
export interface StoredUserProfile {
    character: CharacterId;
    demographics?: Demographics;
    essays: {
        routine: string;
        struggle: string;
        goal: string;
    };
    analysis?: string; // AI-generated personality analysis (from CoD + OpenAI)
    coreMemories?: CoreMemories;
    solvedAcData?: SolvedAcStats | SolvedAcManualInput; // Problem-solving context
    createdAt: string;
    updatedAt: string;
}

const PROFILE_KEY = 'anime-girlfriend.userProfile';
const HINT_LEVELS_KEY = 'anime-girlfriend.hintLevels';
const PROBLEM_CACHE_KEY = 'anime-girlfriend.problemCache';

// Problem-specific hint levels (0 = no hint, 1 = idea, 2 = algorithm, 3 = pseudocode, 4 = code)
export interface ProblemHintLevels {
    [problemId: string]: number;
}

// Cached problem data structure
export interface CachedProblemData {
    problemId: string;
    problemDescription: string;
    problemInput: string;
    problemOutput: string;
    tags: string[];
    solutionSummary: string; // Natural language summary of the solution
    cachedAt: string; // ISO timestamp
}

// Problem cache storage
export interface ProblemCache {
    [problemId: string]: CachedProblemData;
}

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
            profile.analysis = summary;
            profile.updatedAt = new Date().toISOString();
            await this.globalState.update(PROFILE_KEY, profile);
            console.log('[UserDataStore] Personality summary updated');
        }
    }

    /**
     * Update Solved.ac data (after solving a problem)
     */
    async updateSolvedAcData(solvedAcData: SolvedAcStats | SolvedAcManualInput): Promise<void> {
        const profile = this.loadProfile();
        if (profile) {
            profile.solvedAcData = solvedAcData;
            profile.updatedAt = new Date().toISOString();
            await this.globalState.update(PROFILE_KEY, profile);
            console.log('[UserDataStore] Solved.ac data updated');
        }
    }

    /**
     * Clear all stored data (reset)
     */
    async clearProfile(): Promise<void> {
        await this.globalState.update(PROFILE_KEY, undefined);
        await this.globalState.update(HINT_LEVELS_KEY, undefined);
        console.log('[UserDataStore] Profile cleared');
    }

    /**
     * Get hint level for a specific problem
     * @param problemId - BOJ problem ID
     * @returns Current hint level (0-4)
     */
    getHintLevel(problemId: string): number {
        const hintLevels = this.globalState.get<ProblemHintLevels>(HINT_LEVELS_KEY, {});
        return hintLevels[problemId] || 0;
    }

    /**
     * Increment hint level for a problem
     * @param problemId - BOJ problem ID
     * @returns New hint level
     */
    async incrementHintLevel(problemId: string): Promise<number> {
        const hintLevels = this.globalState.get<ProblemHintLevels>(HINT_LEVELS_KEY, {});
        const currentLevel = hintLevels[problemId] || 0;
        const newLevel = Math.min(currentLevel + 1, 4); // Max level is 4
        hintLevels[problemId] = newLevel;
        await this.globalState.update(HINT_LEVELS_KEY, hintLevels);
        console.log(`[UserDataStore] Hint level for problem ${problemId}: ${currentLevel} → ${newLevel}`);
        return newLevel;
    }

    /**
     * Reset hint level for a problem (when problem is solved)
     * @param problemId - BOJ problem ID
     */
    async resetHintLevel(problemId: string): Promise<void> {
        const hintLevels = this.globalState.get<ProblemHintLevels>(HINT_LEVELS_KEY, {});
        delete hintLevels[problemId];
        await this.globalState.update(HINT_LEVELS_KEY, hintLevels);
        console.log(`[UserDataStore] Hint level reset for problem ${problemId}`);
    }

    /**
     * Get current working problem ID
     */
    getCurrentProblem(): string | undefined {
        return this.globalState.get<string>('anime-girlfriend.currentProblem');
    }

    /**
     * Set current working problem ID
     * @param problemId - BOJ problem ID
     */
    async setCurrentProblem(problemId: string): Promise<void> {
        await this.globalState.update('anime-girlfriend.currentProblem', problemId);
        console.log(`[UserDataStore] Current problem set to: ${problemId}`);
    }

    /**
     * Clear current working problem
     */
    async clearCurrentProblem(): Promise<void> {
        await this.globalState.update('anime-girlfriend.currentProblem', undefined);
        console.log('[UserDataStore] Current problem cleared');
    }

    /**
     * Get cached problem data
     * @param problemId - BOJ problem ID
     * @returns Cached problem data or undefined
     */
    getCachedProblem(problemId: string): CachedProblemData | undefined {
        const cache = this.globalState.get<ProblemCache>(PROBLEM_CACHE_KEY, {});
        return cache[problemId];
    }

    /**
     * Check if problem is cached
     * @param problemId - BOJ problem ID
     * @returns true if problem is cached
     */
    isProblemCached(problemId: string): boolean {
        return this.getCachedProblem(problemId) !== undefined;
    }

    /**
     * Save cached problem data
     * @param problemData - Problem data to cache
     */
    async saveCachedProblem(problemData: CachedProblemData): Promise<void> {
        const cache = this.globalState.get<ProblemCache>(PROBLEM_CACHE_KEY, {});
        cache[problemData.problemId] = {
            ...problemData,
            cachedAt: new Date().toISOString()
        };
        await this.globalState.update(PROBLEM_CACHE_KEY, cache);
        console.log(`[UserDataStore] Problem ${problemData.problemId} cached with solution summary`);
    }

    /**
     * Clear cached problem data
     * @param problemId - BOJ problem ID (optional, if not provided clears all)
     */
    async clearCachedProblem(problemId?: string): Promise<void> {
        if (problemId) {
            const cache = this.globalState.get<ProblemCache>(PROBLEM_CACHE_KEY, {});
            delete cache[problemId];
            await this.globalState.update(PROBLEM_CACHE_KEY, cache);
            console.log(`[UserDataStore] Cached problem ${problemId} cleared`);
        } else {
            await this.globalState.update(PROBLEM_CACHE_KEY, {});
            console.log('[UserDataStore] All cached problems cleared');
        }
    }
}


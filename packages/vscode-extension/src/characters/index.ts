/**
 * Character Registry
 * Central registry for all characters
 */

import { CharacterDefinition, CharacterId } from './types';
import { aruConfig } from './aru/config';
import { ARU_PROFILE } from './aru/profile';
import { aruMessages } from './aru/messages';
import { chihiroConfig } from './chihiro/config';
import { CHIHIRO_PROFILE } from './chihiro/profile';
import { chihiroMessages } from './chihiro/messages';

/**
 * Character registry - all available characters
 */
export const CHARACTER_REGISTRY: Record<CharacterId, CharacterDefinition> = {
    aru: {
        id: 'aru',
        config: aruConfig,
        profile: ARU_PROFILE,
        messages: aruMessages
    },
    chihiro: {
        id: 'chihiro',
        config: chihiroConfig,
        profile: CHIHIRO_PROFILE,
        messages: chihiroMessages
    }
};

/**
 * Get character definition by ID
 */
export function getCharacter(id: CharacterId): CharacterDefinition {
    const character = CHARACTER_REGISTRY[id];
    if (!character) {
        throw new Error(`Character "${id}" not found in registry`);
    }
    return character;
}

/**
 * Get all available character IDs
 */
export function getAvailableCharacters(): CharacterId[] {
    return Object.keys(CHARACTER_REGISTRY) as CharacterId[];
}

/**
 * Check if character ID is valid
 */
export function isValidCharacter(id: string): id is CharacterId {
    return id in CHARACTER_REGISTRY;
}

// Re-export types for convenience
export type { CharacterId, CharacterConfig, CharacterMessages, CharacterDefinition } from './types';

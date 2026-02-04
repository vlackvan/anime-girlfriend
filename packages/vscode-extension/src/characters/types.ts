/**
 * Character registry types
 */

export type CharacterId = 'aru' | 'chihiro';

export interface CharacterConfig {
    id: CharacterId;
    name: string;
    fullName: string;
    description: string;
    imagePath: string; // Relative path from extension root
    portraitPath: string; // Relative path from extension root
}

export interface CharacterMessages {
    accepted: string[];
    wrong_answer: string[];
    time_limit: string[];
    memory_limit: string[];
    runtime_error: string[];
    compile_error: string[];
    [key: string]: string[]; // Allow other status types
}

export interface CharacterDefinition {
    id: CharacterId;
    config: CharacterConfig;
    profile: string; // SPC profile text
    messages: CharacterMessages;
}

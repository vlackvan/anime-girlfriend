/**
 * @deprecated This file is deprecated. 
 * Character profiles have been moved to src/characters/
 * 
 * Use getCharacter() from '../../characters' instead.
 * 
 * This file is kept for backward compatibility only.
 */

// Re-export from new location for backward compatibility
import { getCharacter } from '../../characters';

export const ARU_SPC = getCharacter('aru').profile;
export const CHIHIRO_SPC = getCharacter('chihiro').profile;

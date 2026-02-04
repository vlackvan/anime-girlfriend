import { LocalBOJProblem } from '../services/RAGService';
import { SolvedAcStats } from '../SolvedAcService';
import { BaekjoonProblemDescription } from '../services/BaekjoonProblemService';
import { CachedProblemData } from '../UserDataStore';

/**
 * Context aggregated by Worker A (Context Aggregator)
 */
export interface AggregatedContext {
    problemId?: string;
    localBOJData?: LocalBOJProblem;
    ragContext: string;
    codeContext: string;
    userTier?: number;
    userTierName?: string;
    hintLevel: number;
    solvedAcData?: SolvedAcStats;
    problemDescription?: BaekjoonProblemDescription;
    cachedProblemData?: CachedProblemData; // Cached problem data (description, tags, solution summary)
}

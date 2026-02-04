import { LocalBOJProblem } from '../services/RAGService';
import { SolvedAcStats } from '../SolvedAcService';

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
}

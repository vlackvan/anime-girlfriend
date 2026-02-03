import * as vscode from 'vscode';
import { RAGService, LocalBOJProblem } from '../RAGService';
import { CodeContextProvider } from '../../CodeContextProvider';
import { StoredUserProfile, UserDataStore } from '../../UserDataStore';
import { AggregatedContext } from '../../types/PipelineTypes';
import { SolvedAcStats } from '../../SolvedAcService';

/**
 * Worker A: Context Aggregator
 * Collects all external knowledge and user state
 */
export class ContextAggregator {
    private ragService: RAGService;
    private codeContextProvider: CodeContextProvider;
    private userDataStore: UserDataStore;
    private userProfile?: StoredUserProfile;
    private logPipeline: (message: string, data?: any) => void;

    constructor(
        ragService: RAGService,
        codeContextProvider: CodeContextProvider,
        userDataStore: UserDataStore,
        userProfile: StoredUserProfile | undefined,
        logPipeline: (message: string, data?: any) => void
    ) {
        this.ragService = ragService;
        this.codeContextProvider = codeContextProvider;
        this.userDataStore = userDataStore;
        this.userProfile = userProfile;
        this.logPipeline = logPipeline;
    }

    /**
     * Aggregate all context for the pipeline
     */
    async aggregate(userMessage: string): Promise<AggregatedContext> {
        this.logPipeline(`  [Worker A] Detecting BOJ problem...`);
        const detectedProblemId = this.detectBOJProblem(userMessage);
        const problemId = detectedProblemId ?? undefined;
        this.logPipeline(`  [Worker A] Problem ID detected: ${problemId || 'None'}`);

        let ragContext = '';
        let localBOJData: LocalBOJProblem | undefined;

        // Get RAG context
        try {
            if (problemId) {
                this.logPipeline(`  [Worker A] Retrieving BOJ-specific context for problem ${problemId}...`);
                const { documents, formattedContext } = await this.ragService.retrieveBOJContext(problemId);
                ragContext = formattedContext;
                this.logPipeline(`  [Worker A] RAG: Retrieved ${documents.length} document(s)`);
                if (documents.length > 0) {
                    const docTypes = documents.map(d => d.metadata.type).join(', ');
                    this.logPipeline(`  [Worker A] RAG: Document types: ${docTypes}`);
                }
                
                // Get local BOJ data
                this.logPipeline(`  [Worker A] Loading local BOJ data for problem ${problemId}...`);
                const localData = await this.ragService.getLocalBOJProblem(problemId);
                localBOJData = localData ?? undefined;
                if (localBOJData) {
                    this.logPipeline(`  [Worker A] Local BOJ Data: ${localBOJData.titleKo} (${localBOJData.difficultyName})`);
                } else {
                    this.logPipeline(`  [Worker A] Local BOJ Data: Not found`);
                }
            } else if (this.ragService.isEnabled()) {
                this.logPipeline(`  [Worker A] Retrieving general RAG context...`);
                const { documents, formattedContext } = await this.ragService.retrieveContext(userMessage);
                ragContext = formattedContext;
                if (documents.length > 0) {
                    this.logPipeline(`  [Worker A] RAG: Retrieved ${documents.length} document(s)`);
                    const docTypes = documents.map(d => d.metadata.type).join(', ');
                    this.logPipeline(`  [Worker A] RAG: Document types: ${docTypes}`);
                } else {
                    this.logPipeline(`  [Worker A] RAG: No relevant documents found`);
                }
            } else {
                this.logPipeline(`  [Worker A] RAG: Service disabled`);
            }
        } catch (error) {
            this.logPipeline(`  [Worker A] ❌ RAG retrieval failed:`, error);
            console.error('[ContextAggregator] Failed to retrieve RAG context:', error);
        }

        // Get code context
        this.logPipeline(`  [Worker A] Building code context...`);
        const codeContext = this.codeContextProvider.buildContextString();
        this.logPipeline(`  [Worker A] Code context length: ${codeContext.length} chars`);

        // Get user tier and hint level
        this.logPipeline(`  [Worker A] Loading user profile data...`);
        let userTier: number | undefined;
        let userTierName: string | undefined;
        let hintLevel = 0;
        const solvedAcData = this.userProfile?.solvedAcData;

        if (solvedAcData && 'tier' in solvedAcData) {
            userTier = solvedAcData.tier;
            userTierName = this.getTierName(solvedAcData.tier);
            this.logPipeline(`  [Worker A] User Tier: ${userTierName} (Level ${userTier})`);
        } else {
            this.logPipeline(`  [Worker A] User Tier: Not available`);
        }

        if (problemId) {
            hintLevel = this.userDataStore.getHintLevel(problemId);
            this.logPipeline(`  [Worker A] Hint Level for problem ${problemId}: ${hintLevel}`);
        }

        const context: AggregatedContext = {
            problemId,
            localBOJData,
            ragContext,
            codeContext,
            userTier,
            userTierName,
            hintLevel,
            solvedAcData: solvedAcData && 'tier' in solvedAcData ? solvedAcData : undefined
        };

        return context;
    }

    /**
     * Detect if a message mentions a BOJ problem
     */
    private detectBOJProblem(message: string): string | null {
        const patterns = [
            /백준\s*(\d{4,5})/i,
            /boj\s*(\d{4,5})/i,
            /(\d{4,5})번/,
            /problem\s*#?\s*(\d{4,5})/i,
            /문제\s*(\d{4,5})/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    /**
     * Get tier name from tier number
     */
    private getTierName(tier: number): string {
        const tierNames = [
            'Unrated',
            'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
            'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
            'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
            'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
            'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
            'Ruby V', 'Ruby IV', 'Ruby III', 'Ruby II', 'Ruby I',
        ];
        return tierNames[tier] || 'Unknown';
    }
}

import * as vscode from 'vscode';
import { RAGService, LocalBOJProblem } from '../RAGService';
import { CodeContextProvider } from '../../CodeContextProvider';
import { StoredUserProfile, UserDataStore } from '../../UserDataStore';
import { AggregatedContext } from '../../types/PipelineTypes';
import { SolvedAcStats } from '../../SolvedAcService';
import { fetchProblemDescription, BaekjoonProblemDescription } from '../BaekjoonProblemService';

/**
 * Worker A: Context Aggregator
 * Collects all external knowledge and user state
 */
export class ContextAggregator {
    private ragService: RAGService;
    private codeContextProvider: CodeContextProvider;
    private userDataStore: UserDataStore;
    private userProfile?: StoredUserProfile;

    constructor(
        ragService: RAGService,
        codeContextProvider: CodeContextProvider,
        userDataStore: UserDataStore,
        userProfile: StoredUserProfile | undefined
    ) {
        this.ragService = ragService;
        this.codeContextProvider = codeContextProvider;
        this.userDataStore = userDataStore;
        this.userProfile = userProfile;
    }

    /**
     * Aggregate all context for the pipeline
     */
    async aggregate(userMessage: string): Promise<AggregatedContext> {
        // Get current working problem from store (explicit tracking)
        console.log(`  [Worker A] Getting current working problem...`);
        const problemId = this.userDataStore.getCurrentProblem();
        console.log(`  [Worker A] Current Working Problem: ${problemId || 'None (no problem selected)'}`);

        let ragContext = '';
        let localBOJData: LocalBOJProblem | undefined;
        let problemDescription: BaekjoonProblemDescription | undefined;

        // Get RAG context
        try {
            // RAG retrieval disabled by user request (using direct local lookup only)
            if (problemId) {
                // console.log(`  [Worker A] Retrieving BOJ-specific context for problem ${problemId}...`);
                // const { documents, formattedContext } = await this.ragService.retrieveBOJContext(problemId);
                // ragContext = formattedContext;
                // console.log(`  [Worker A] RAG: Retrieved ${documents.length} document(s)`);
                // if (documents.length > 0) {
                //     const docTypes = documents.map(d => d.metadata.type).join(', ');
                //     console.log(`  [Worker A] RAG: Document types: ${docTypes}`);
                // }

                // Get local BOJ data
                console.log(`  [Worker A] Loading local BOJ data for problem ${problemId}...`);
                const localData = await this.ragService.getLocalBOJProblem(problemId);
                localBOJData = localData ?? undefined;
                if (localBOJData) {
                    console.log(`  [Worker A] Local BOJ Data: ${localBOJData.titleKo} (${localBOJData.difficultyName})`);
                } else {
                    console.log(`  [Worker A] Local BOJ Data: Not found`);
                }

                // Fetch problem description from Baekjoon
                console.log(`  [Worker A] Fetching problem description for problem ${problemId}...`);
                try {
                    const description = await fetchProblemDescription(problemId);
                    if (description) {
                        problemDescription = description;
                        console.log(`  [Worker A] Problem description fetched successfully`);
                    } else {
                        console.log(`  [Worker A] Failed to fetch problem description`);
                    }
                } catch (error) {
                    console.error(`  [Worker A] ❌ Failed to fetch problem description:`, error);
                }
            } else if (this.ragService.isEnabled()) {
                // RAG retrieval disabled by user request
                // console.log(`  [Worker A] Retrieving general RAG context...`);
                // const { documents, formattedContext } = await this.ragService.retrieveContext(userMessage);
                // ragContext = formattedContext;
                // if (documents.length > 0) {
                //     console.log(`  [Worker A] RAG: Retrieved ${documents.length} document(s)`);
                //     const docTypes = documents.map(d => d.metadata.type).join(', ');
                //     console.log(`  [Worker A] RAG: Document types: ${docTypes}`);
                // } else {
                //     console.log(`  [Worker A] RAG: No relevant documents found`);
                // }
                console.log(`  [Worker A] RAG: Search disabled by user request.`);
            } else {
                console.log(`  [Worker A] RAG: Service disabled`);
            }
        } catch (error) {
            console.error(`  [Worker A] ❌ RAG retrieval failed:`, error);
            console.error('[ContextAggregator] Failed to retrieve RAG context:', error);
        }

        // Get code context
        console.log(`  [Worker A] Building code context...`);
        const codeContext = this.codeContextProvider.buildContextString();
        console.log(`  [Worker A] Code context length: ${codeContext.length} chars`);

        // Get user tier and hint level
        console.log(`  [Worker A] Loading user profile data...`);
        let userTier: number | undefined;
        let userTierName: string | undefined;
        let hintLevel = 0;
        const solvedAcData = this.userProfile?.solvedAcData;

        if (solvedAcData && 'tier' in solvedAcData) {
            userTier = solvedAcData.tier;
            userTierName = this.getTierName(solvedAcData.tier);
            console.log(`  [Worker A] User Tier: ${userTierName} (Level ${userTier})`);
        } else {
            console.log(`  [Worker A] User Tier: Not available`);
        }

        if (problemId) {
            hintLevel = this.userDataStore.getHintLevel(problemId);
            console.log(`  [Worker A] Hint Level for problem ${problemId}: ${hintLevel}`);
        }

        const context: AggregatedContext = {
            problemId,
            localBOJData,
            ragContext,
            codeContext,
            userTier,
            userTierName,
            hintLevel,
            solvedAcData: solvedAcData && 'tier' in solvedAcData ? solvedAcData : undefined,
            problemDescription
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

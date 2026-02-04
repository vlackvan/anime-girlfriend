import * as vscode from 'vscode';
import { RAGService, LocalBOJProblem } from '../RAGService';
import { CodeContextProvider } from '../../CodeContextProvider';
import { StoredUserProfile, UserDataStore, CachedProblemData } from '../../UserDataStore';
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
        let cachedProblemData: CachedProblemData | undefined;

        // Get RAG context
        try {
            // RAG retrieval disabled by user request (using direct local lookup only)
            if (problemId) {
                // Check for cached problem data first
                console.log(`  [Worker A] Checking cache for problem ${problemId}...`);
                const cached = this.userDataStore.getCachedProblem(problemId);
                if (cached) {
                    cachedProblemData = cached;
                    console.log(`  [Worker A] ✅ Using cached problem data`);
                    console.log(`  [Worker A]   - Cached at: ${cached.cachedAt}`);
                    console.log(`  [Worker A]   - Tags: ${cached.tags.join(', ')}`);
                    console.log(`  [Worker A]   - Solution summary: ${cached.solutionSummary.length} chars`);
                    
                    // Use cached problem description
                    problemDescription = {
                        problemId: cached.problemId,
                        problemDescription: cached.problemDescription,
                        problemInput: cached.problemInput,
                        problemOutput: cached.problemOutput
                    };
                    console.log(`  [Worker A]   - Problem description: ${cached.problemDescription.length} chars`);
                } else {
                    console.log(`  [Worker A] ⚠️ No cached data found, will fetch from Baekjoon`);
                }

                // Get local BOJ data
                console.log(`  [Worker A] Loading local BOJ data for problem ${problemId}...`);
                const localData = await this.ragService.getLocalBOJProblem(problemId);
                localBOJData = localData ?? undefined;
                if (localBOJData) {
                    console.log(`  [Worker A] Local BOJ Data: ${localBOJData.titleKo} (${localBOJData.difficultyName})`);
                } else {
                    console.log(`  [Worker A] Local BOJ Data: Not found`);
                }

                // Fetch problem description from Baekjoon only if not cached
                if (!cachedProblemData) {
                    console.log(`  [Worker A] 🔍 Fetching problem description for problem ${problemId}...`);
                    try {
                        const description = await fetchProblemDescription(problemId);
                        if (description) {
                            problemDescription = description;
                            console.log(`  [Worker A] ✅ Problem description fetched successfully`);
                            console.log(`  [Worker A] 📊 Fetched Data:`);
                            console.log(`  [Worker A]   - Description: ${description.problemDescription.length} chars`);
                            console.log(`  [Worker A]   - Input: ${description.problemInput.length} chars`);
                            console.log(`  [Worker A]   - Output: ${description.problemOutput.length} chars`);
                            console.log(`  [Worker A] 📝 Full Description Preview:`);
                            console.log(`  [Worker A] ${description.problemDescription.substring(0, 400)}${description.problemDescription.length > 400 ? '...' : ''}`);
                        } else {
                            console.log(`  [Worker A] ❌ Failed to fetch problem description`);
                        }
                    } catch (error) {
                        console.error(`  [Worker A] ❌ Failed to fetch problem description:`, error);
                    }
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
            problemDescription,
            cachedProblemData
        };

        // Log context summary
        console.log(`  [Worker A] Context Summary:`);
        console.log(`    - Problem ID: ${problemId || 'None'}`);
        console.log(`    - Cached Problem Data: ${cachedProblemData ? '✅ Available' : '❌ Not available'}`);
        if (cachedProblemData) {
            console.log(`    - Cached Tags: ${cachedProblemData.tags.join(', ')}`);
            console.log(`    - Solution Summary: ${cachedProblemData.solutionSummary.length} chars`);
        }
        console.log(`    - Problem Description: ${problemDescription ? '✅ Available' : '❌ Not available'}`);
        if (problemDescription) {
            console.log(`    - Description length: ${problemDescription.problemDescription.length} chars`);
        }
        console.log(`    - Local BOJ Data: ${localBOJData ? '✅ Available' : '❌ Not available'}`);
        console.log(`    - Code Context: ${codeContext.length} chars`);
        console.log(`    - Hint Level: ${hintLevel}`);

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

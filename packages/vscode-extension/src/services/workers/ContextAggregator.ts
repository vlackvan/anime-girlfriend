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
        let problemId = this.userDataStore.getCurrentProblem();

        // Check if the message is conversational (not problem-related)
        const isConversational = this.isConversationalMessage(userMessage);
        console.log(`  [Worker A] Message Type: ${isConversational ? 'Conversational' : 'Problem-related'}`);

        // If message is conversational, don't use the current problem context
        // This allows the agent to have normal conversations
        if (isConversational && problemId) {
            console.log(`  [Worker A] Ignoring current problem (${problemId}) for conversational message`);
            problemId = undefined;
        }

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

        // Log code context details for debugging
        const activeContext = this.codeContextProvider.getActiveContext();
        if (activeContext) {
            console.log(`  [Worker A] 📄 Active File: ${activeContext.fileName} (${activeContext.languageId})`);
            console.log(`  [Worker A] 📊 Code Length: ${activeContext.content.length} chars`);
            console.log(`  [Worker A] 🔍 Diagnostics: ${activeContext.diagnostics.length} (${activeContext.diagnostics.filter(d => d.severity === 'error').length} errors)`);
            if (activeContext.selectedText) {
                console.log(`  [Worker A] ✂️ Selected Text: ${activeContext.selectedText.length} chars`);
            }
        } else {
            console.log(`  [Worker A] ⚠️ No active code file`);
        }

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
     * Detect if a message is conversational (not problem-related)
     * Returns true if the message is general conversation, false if it's asking about a problem
     */
    private isConversationalMessage(message: string): boolean {
        const lowerMessage = message.toLowerCase();

        // Problem-related keywords (Korean and English)
        const problemKeywords = [
            '힌트', 'hint', '문제', 'problem', '풀이', 'solution',
            '어떻게', 'how', '알고리즘', 'algorithm', '코드', 'code',
            '디버그', 'debug', '에러', 'error', '틀렸', 'wrong',
            '접근', 'approach', '방법', 'method', '시간복잡도', 'complexity',
            '도와', 'help', '설명', 'explain', '이해', 'understand',
            '뭐야', '뭔지', '모르겠', '막혔', '안돼', '안풀려'
        ];

        // Conversational keywords (Korean and English)
        const conversationalKeywords = [
            '안녕', '하이', 'hi', 'hello', '사랑', 'love',
            '좋아', '행복', 'happy', '기억', 'memory', '추억',
            '어때', '어떻', 'how are', '오늘', 'today',
            '함께', 'together', '같이', '우리', 'we', 'us',
            '고마', 'thank', '미안', 'sorry', '잘했', 'good job',
            '재밌', 'fun', '신나', 'excited', '피곤', 'tired',
            '배고', 'hungry', '자', 'sleep', '아침', '점심', '저녁'
        ];

        // Check if message contains problem-related keywords
        const hasProblemKeywords = problemKeywords.some(keyword =>
            lowerMessage.includes(keyword)
        );

        // Check if message contains conversational keywords
        const hasConversationalKeywords = conversationalKeywords.some(keyword =>
            lowerMessage.includes(keyword)
        );

        // If it has problem keywords but not conversational ones, it's problem-related
        if (hasProblemKeywords && !hasConversationalKeywords) {
            return false;
        }

        // If it has conversational keywords, it's conversational
        if (hasConversationalKeywords) {
            return true;
        }

        // Very short messages (< 10 chars) are likely conversational
        if (message.trim().length < 10) {
            return true;
        }

        // Check if message contains question words with problem context
        const questionWords = ['어떻게', 'how', '왜', 'why', '뭐', 'what'];
        const hasQuestionWord = questionWords.some(word => lowerMessage.includes(word));

        // Question words with problem keywords = problem-related
        // Question words without problem keywords = might be conversational
        if (hasQuestionWord && !hasProblemKeywords) {
            return true;
        }

        // Default: if unclear, treat as problem-related to maintain current behavior
        // This is a safe default for the tutoring system
        return false;
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

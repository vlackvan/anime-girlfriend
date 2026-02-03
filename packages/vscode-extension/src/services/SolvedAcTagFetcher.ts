import fetch from 'node-fetch';

export interface ProblemMetadata {
    problemId: number;
    titleKo: string;
    difficulty: number;
    tags: string[];
    recommendedApproach: string;
}

interface SolvedAcProblem {
    problemId: number;
    titleKo: string;
    level: number;
    tags: Array<{
        key: string;
        displayNames: Array<{
            language: string;
            name: string;
        }>;
    }>;
}

interface SolvedAcResponse {
    count: number;
    items: SolvedAcProblem[];
}

export class SolvedAcTagFetcher {
    private static instance: SolvedAcTagFetcher;
    private readonly API_BASE = 'https://solved.ac/api/v3';
    private readonly RATE_LIMIT_DELAY = 50; // 50ms between requests
    private readonly BATCH_SIZE = 100; // Problems per page

    private constructor() {}

    public static getInstance(): SolvedAcTagFetcher {
        if (!SolvedAcTagFetcher.instance) {
            SolvedAcTagFetcher.instance = new SolvedAcTagFetcher();
        }
        return SolvedAcTagFetcher.instance;
    }

    /**
     * Fetch problem metadata for a given number of problems
     * @param limit - Maximum number of problems to fetch
     * @returns Array of problem metadata
     */
    public async fetchProblems(limit: number = 5000): Promise<ProblemMetadata[]> {
        const problems: ProblemMetadata[] = [];
        let page = 1;
        let totalFetched = 0;

        console.log(`[SolvedAcTagFetcher] Starting to fetch up to ${limit} problems...`);

        while (totalFetched < limit) {
            try {
                const batchSize = Math.min(this.BATCH_SIZE, limit - totalFetched);
                const response = await this.fetchPage(page, batchSize);

                if (!response || response.items.length === 0) {
                    console.log('[SolvedAcTagFetcher] No more problems available');
                    break;
                }

                // Process each problem in the batch
                for (const problem of response.items) {
                    try {
                        const metadata = this.processProblem(problem);
                        problems.push(metadata);
                        totalFetched++;

                        // Log progress every 100 problems
                        if (totalFetched % 100 === 0) {
                            console.log(`[SolvedAcTagFetcher] Fetched ${totalFetched}/${limit} problems...`);
                        }

                        if (totalFetched >= limit) {
                            break;
                        }
                    } catch (error) {
                        console.error(`[SolvedAcTagFetcher] Failed to process problem ${problem.problemId}:`, error);
                        // Skip this problem and continue
                    }
                }

                // Rate limiting: wait 50ms before next request
                if (totalFetched < limit) {
                    await this.sleep(this.RATE_LIMIT_DELAY);
                }

                page++;
            } catch (error) {
                console.error(`[SolvedAcTagFetcher] Failed to fetch page ${page}:`, error);
                // Continue to next page
                page++;
                await this.sleep(this.RATE_LIMIT_DELAY);
            }
        }

        console.log(`[SolvedAcTagFetcher] Successfully fetched ${problems.length} problems`);
        return problems;
    }

    /**
     * Fetch a single page of problems from solved.ac API
     * @param page - Page number (1-indexed)
     * @param size - Number of problems per page
     * @returns API response with problems
     */
    private async fetchPage(page: number, size: number): Promise<SolvedAcResponse> {
        const url = `${this.API_BASE}/search/problem?query=&sort=id&direction=asc&page=${page}&size=${size}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AnimeGirlfriendVSCodeExtension/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        return await response.json() as SolvedAcResponse;
    }

    /**
     * Process a single problem from the API response
     * @param problem - Raw problem data from API
     * @returns Processed problem metadata
     */
    private processProblem(problem: SolvedAcProblem): ProblemMetadata {
        const tags = problem.tags.map(tag => tag.key);
        const recommendedApproach = this.generateRecommendedApproach(tags, problem.titleKo);

        return {
            problemId: problem.problemId,
            titleKo: problem.titleKo,
            difficulty: problem.level,
            tags,
            recommendedApproach
        };
    }

    /**
     * Generate recommended approach based on problem tags
     * @param tags - Array of algorithm tag keys
     * @param title - Problem title for context
     * @returns Human-readable approach recommendation
     */
    private generateRecommendedApproach(tags: string[], title: string): string {
        const approaches: string[] = [];

        // Tag-based approach recommendations
        const tagStrategies: Record<string, string> = {
            'dp': 'Use dynamic programming with memoization or tabulation. Define states clearly and identify optimal substructure.',
            'graphs': 'Model the problem as a graph and use appropriate traversal (BFS for shortest path, DFS for connectivity).',
            'bfs': 'Use breadth-first search to explore nodes level by level, ideal for shortest path in unweighted graphs.',
            'dfs': 'Use depth-first search to explore paths completely before backtracking, useful for cycle detection and connectivity.',
            'binary_search': 'Use binary search for logarithmic time lookup or to find optimal values in sorted/monotonic spaces.',
            'greedy': 'Greedily select the locally optimal choice at each step. Prove that local optimality leads to global optimality.',
            'sorting': 'Sort the input data to enable efficient searching, grouping, or to identify patterns.',
            'two_pointer': 'Use two pointers moving towards each other or in the same direction to reduce time complexity from O(n²) to O(n).',
            'data_structures': 'Choose appropriate data structures (stack, queue, heap, set) based on required operations.',
            'implementation': 'Carefully implement the logic following the problem requirements. Focus on edge cases and constraints.',
            'math': 'Use mathematical formulas, number theory, or combinatorics to solve the problem efficiently.',
            'string': 'Apply string algorithms like pattern matching, string hashing, or suffix arrays.',
            'bruteforcing': 'Try all possible combinations systematically. Optimize with pruning if needed.',
            'trees': 'Use tree traversal algorithms (in-order, pre-order, post-order) or tree DP for optimal solutions.',
            'prefix_sum': 'Precompute prefix sums for O(1) range queries after O(n) preprocessing.',
            'simulation': 'Simulate the process step-by-step as described in the problem statement.',
            'geometry': 'Apply geometric algorithms like convex hull, line intersection, or coordinate transformations.',
            'divide_and_conquer': 'Divide the problem into smaller subproblems, solve them recursively, and combine the results.',
            'backtracking': 'Explore all possible solutions recursively and backtrack when constraints are violated.',
            'sliding_window': 'Maintain a window of elements and slide it across the array to find optimal subarrays.',
        };

        // Add approaches based on tags
        for (const tag of tags) {
            if (tagStrategies[tag]) {
                approaches.push(tagStrategies[tag]);
            }
        }

        // If no specific tags matched, provide generic advice
        if (approaches.length === 0) {
            approaches.push('Analyze the problem constraints and requirements carefully. Consider time/space complexity and choose appropriate algorithms.');
        }

        // Combine approaches with proper formatting
        if (approaches.length === 1) {
            return approaches[0];
        } else if (approaches.length === 2) {
            return `${approaches[0]} ${approaches[1]}`;
        } else {
            // For 3+ approaches, prioritize the first 2-3 most relevant
            return approaches.slice(0, 3).join(' ');
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param ms - Milliseconds to sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch metadata for specific problem IDs
     * @param problemIds - Array of problem IDs to fetch
     * @returns Array of problem metadata
     */
    public async fetchSpecificProblems(problemIds: number[]): Promise<ProblemMetadata[]> {
        const problems: ProblemMetadata[] = [];

        console.log(`[SolvedAcTagFetcher] Fetching ${problemIds.length} specific problems...`);

        for (const problemId of problemIds) {
            try {
                const url = `${this.API_BASE}/problem/show?problemId=${problemId}`;
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'AnimeGirlfriendVSCodeExtension/1.0'
                    }
                });

                if (response.ok) {
                    const problem = await response.json() as SolvedAcProblem;
                    const metadata = this.processProblem(problem);
                    problems.push(metadata);
                } else {
                    console.error(`[SolvedAcTagFetcher] Failed to fetch problem ${problemId}: ${response.status}`);
                }

                // Rate limiting
                await this.sleep(this.RATE_LIMIT_DELAY);
            } catch (error) {
                console.error(`[SolvedAcTagFetcher] Error fetching problem ${problemId}:`, error);
            }
        }

        console.log(`[SolvedAcTagFetcher] Successfully fetched ${problems.length}/${problemIds.length} problems`);
        return problems;
    }

    /**
     * Get difficulty level name
     * @param level - Numeric difficulty level (1-30)
     * @returns Human-readable difficulty name
     */
    public static getDifficultyName(level: number): string {
        const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'];
        const tierIndex = Math.floor((level - 1) / 5);
        const subLevel = 5 - ((level - 1) % 5);

        if (tierIndex < 0 || tierIndex >= tiers.length) {
            return `Level ${level}`;
        }

        return `${tiers[tierIndex]} ${subLevel}`;
    }
}

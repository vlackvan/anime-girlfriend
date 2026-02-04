// Using global fetch (available in Node.js 18+)

export interface SolvedAcProblemStat {
    level: number;
    count: number;
}

export interface SolvedAcTagStat {
    tag: {
        key: string;
        bojTagId: number;
        displayNames: { language: string; name: string; short: string }[];
    };
    count: number;
}

export interface SolvedAcUserInfo {
    handle: string;
    rating: number;
    tier: number;
    solvedCount: number;
    class: number;
    classDecoration: string;
}

export interface SolvedAcTop100Problem {
    problemId: number;
    titleKo: string;
    level: number;
    solvedAc?: {
        exp: number;
    };
}

export interface SolvedAcStats {
    handle: string;
    rating: number;
    tier: number;
    solvedCount: number;
    class: number;
    problemStats: SolvedAcProblemStat[];
    tagStats: SolvedAcTagStat[];
    summary: string;
}

export interface SolvedAcManualInput {
    problemCount: string;
    proficientAreas: string[];
    weakAreas: string[];
    summary: string;
}

export class SolvedAcService {
    private static API_BASE = 'https://solved.ac/api/v3';
    private static TIER_NAMES = [
        'Unrated',
        'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
        'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
        'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
        'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
        'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
        'Ruby V', 'Ruby IV', 'Ruby III', 'Ruby II', 'Ruby I',
    ];

    /**
     * Fetch user information (rating, tier, solved count)
     */
    async getUserInfo(handle: string): Promise<SolvedAcUserInfo> {
        const response = await fetch(`${SolvedAcService.API_BASE}/user/show?handle=${encodeURIComponent(handle)}`);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`사용자 '${handle}'을(를) Solved.ac에서 찾을 수 없습니다.`);
            }
            throw new Error(`사용자 정보를 가져오는데 실패했습니다: ${response.statusText}`);
        }
        const data = await response.json();
        return {
            handle: data.handle,
            rating: data.rating,
            tier: data.tier,
            solvedCount: data.solvedCount,
            class: data.class,
            classDecoration: data.classDecoration,
        };
    }

    /**
     * Fetch user problem stats (by level)
     */
    async getUserProblemStats(handle: string): Promise<SolvedAcProblemStat[]> {
        const response = await fetch(`${SolvedAcService.API_BASE}/user/problem_stats?handle=${handle}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch problem stats for ${handle}`);
        }
        const data = await response.json();

        // Data is Array< { level: number, solved: number, ... } >
        // We need to map 'solved' to 'count'
        const rawList = Array.isArray(data) ? data : (data as any).items || [];

        return rawList.map((item: any) => ({
            level: item.level,
            count: item.solved // Map 'solved' to 'count'
        }));
    }

    /**
     * Fetch user problem tag stats (by category)
     */
    async getUserProblemTagStats(handle: string): Promise<SolvedAcTagStat[]> {
        const response = await fetch(`${SolvedAcService.API_BASE}/user/problem_tag_stats?handle=${handle}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch tag stats for ${handle}`);
        }
        const data = await response.json();

        // Data is { items: Array< { tag: {...}, solved: number, ... } > }
        const rawItems = Array.isArray(data) ? data : (data as any).items || [];

        return rawItems.map((item: any) => ({
            tag: item.tag,
            count: item.solved // Map 'solved' to 'count'
        }));
    }

    /**
     * Get tier name from tier number
     */
    private getTierName(tier: number): string {
        if (tier >= 0 && tier < SolvedAcService.TIER_NAMES.length) {
            return SolvedAcService.TIER_NAMES[tier];
        }
        return 'Unknown';
    }

    /**
     * Get Korean tag name from tag object
     */
    private getKoreanTagName(tag: SolvedAcTagStat['tag']): string {
        const koreanName = tag.displayNames.find(d => d.language === 'ko');
        return koreanName?.name || tag.key;
    }

    /**
     * Orchestrates fetching all stats and generates a natural language summary
     */
    async getStatsSummary(handle: string): Promise<SolvedAcStats> {
        try {
            // Fetch all data in parallel
            const [userInfo, problemStats, tagStats] = await Promise.all([
                this.getUserInfo(handle),
                this.getUserProblemStats(handle),
                this.getUserProblemTagStats(handle),
            ]);

            // Generate natural language summary in Korean
            const summary = this.generateSummaryFromStats(userInfo, problemStats, tagStats);

            return {
                handle: userInfo.handle,
                rating: userInfo.rating,
                tier: userInfo.tier,
                solvedCount: userInfo.solvedCount,
                class: userInfo.class,
                problemStats,
                tagStats,
                summary,
            };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Solved.ac 통계를 가져오는 중 알 수 없는 오류가 발생했습니다.');
        }
    }

    /**
     * Generate natural language summary from stats (in Korean)
     */
    private generateSummaryFromStats(
        userInfo: SolvedAcUserInfo,
        problemStats: SolvedAcProblemStat[],
        tagStats: SolvedAcTagStat[]
    ): string {
        const tierName = this.getTierName(userInfo.tier);
        const parts: string[] = [];

        // Basic stats
        parts.push(`이 사용자는 백준 온라인 저지에서 ${userInfo.solvedCount}개의 문제를 해결했으며, 현재 티어는 ${tierName} (레이팅: ${userInfo.rating})입니다.`);

        // Problem level distribution
        if (problemStats.length > 0) {
            const sortedLevels = [...problemStats].sort((a, b) => b.count - a.count);
            const topLevels = sortedLevels.slice(0, 3).filter(l => l.count > 0);

            if (topLevels.length > 0) {
                const levelNames = topLevels.map(l => `${this.getTierName(l.level)} (${l.count}개)`);
                parts.push(`가장 많이 해결한 난이도는 ${levelNames.join(', ')}입니다.`);
            }
        }

        // Tag proficiency
        if (tagStats.length > 0) {
            const sortedTags = [...tagStats].sort((a, b) => b.count - a.count);

            const proficientTags = sortedTags.filter(t => t.count > 10);
            const basicTags = sortedTags.filter(t => t.count >= 1 && t.count <= 10);

            // Proficient tags (Top 5 max)
            if (proficientTags.length > 0) {
                const tagNames = proficientTags.slice(0, 5).map(t =>
                    `${this.getKoreanTagName(t.tag)}`
                );
                parts.push(`다음 태그와 관련된 문제 해결에 능숙합니다: ${tagNames.join(', ')}.`);
            }

            // Basic tags (Top 5 max, if no proficient tags, maybe show more? logic: just show top 5 of basic too)
            if (basicTags.length > 0) {
                // If we have proficient tags, we might want to limit basic tags to avoid too much noise.
                // But let's just show top 5 basic ones too.
                const tagNames = basicTags.slice(0, 5).map(t =>
                    `${this.getKoreanTagName(t.tag)}`
                );
                parts.push(`다음 태그에 대해 기초적인 이해를 가지고 있습니다: ${tagNames.join(', ')}.`);
            }
        }

        // Experience level interpretation
        if (userInfo.solvedCount < 50) {
            parts.push('알고리즘 문제 해결을 시작한 초심자입니다.');
        } else if (userInfo.solvedCount < 200) {
            parts.push('기초를 다지고 있는 학습자입니다.');
        } else if (userInfo.solvedCount < 500) {
            parts.push('꾸준히 연습하며 실력을 쌓아가고 있습니다.');
        } else if (userInfo.solvedCount < 1000) {
            parts.push('상당한 경험을 쌓은 숙련된 문제 해결자입니다.');
        } else {
            parts.push('풍부한 경험을 가진 고수입니다.');
        }

        // Class decoration (if achieved)
        if (userInfo.class > 0) {
            parts.push(`Class ${userInfo.class} 달성자입니다.`);
        }

        return parts.join(' ');
    }

    /**
     * Generate fallback summary from manual input (in Korean)
     */
    generateFallbackSummary(
        problemCount: string,
        proficientAreas: string[],
        weakAreas: string[]
    ): string {
        const parts: string[] = [];

        // Problem count interpretation
        const countMap: { [key: string]: string } = {
            'none': '아직 알고리즘 문제를 풀어보지 않았습니다.',
            '1-50': '알고리즘 문제 해결을 시작한 초심자입니다. 약 1-50개의 문제를 해결했습니다.',
            '51-100': '기초를 다지고 있는 학습자입니다. 약 51-100개의 문제를 해결했습니다.',
            '101-500': '꾸준히 연습하며 실력을 쌓아가고 있습니다. 약 101-500개의 문제를 해결했습니다.',
            '501-1000': '상당한 경험을 쌓은 숙련된 문제 해결자입니다. 약 501-1000개의 문제를 해결했습니다.',
            '1000+': '풍부한 경험을 가진 고수입니다. 1000개 이상의 문제를 해결했습니다.',
        };

        parts.push(countMap[problemCount] || countMap['none']);

        // Proficient areas
        if (proficientAreas.length > 0) {
            parts.push(`다음 분야의 문제 해결에 능숙합니다: ${proficientAreas.join(', ')}.`);
        }

        // Weak areas
        if (weakAreas.length > 0) {
            parts.push(`보완이 필요한 분야는 ${weakAreas.join(', ')}입니다.`);
        }

        return parts.join(' ');
    }

    /**
     * Get recommended problems based on user tier
     * @param userTier - User's Solved.ac tier (0-30)
     * @param count - Number of problems to recommend (default 5)
     */
    async getRecommendedProblems(userTier: number, count: number = 5): Promise<{
        problemId: string;
        title: string;
        level: string;
        tags: string[];
    }[]> {
        try {
            // Query problems around user's tier (±2 levels for variety)
            const minLevel = Math.max(1, userTier - 2);
            const maxLevel = Math.min(30, userTier + 2);

            // Solved.ac API endpoint for problem search
            const query = `tier:${minLevel}..${maxLevel}`;
            const response = await fetch(
                `${SolvedAcService.API_BASE}/search/problem?query=${encodeURIComponent(query)}&sort=random&direction=asc&page=1`
            );

            if (!response.ok) {
                console.error('[SolvedAcService] Failed to fetch recommendations:', response.statusText);
                return [];
            }

            const data = await response.json();
            const problems = data.items || [];

            return problems.slice(0, count).map((p: any) => ({
                problemId: String(p.problemId),
                title: p.titleKo || p.title || `Problem ${p.problemId}`,
                level: SolvedAcService.TIER_NAMES[p.level] || `Level ${p.level}`,
                tags: (p.tags || []).slice(0, 3).map((t: any) => this.getKoreanTagName(t))
            }));
        } catch (error) {
            console.error('[SolvedAcService] Error fetching recommendations:', error);
            return [];
        }
    }
}

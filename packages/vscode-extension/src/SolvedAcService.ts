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
    top100: SolvedAcTop100Problem[];
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
        return response.json() as Promise<SolvedAcProblemStat[]>;
    }

    /**
     * Fetch user problem tag stats (by category)
     */
    async getUserProblemTagStats(handle: string): Promise<SolvedAcTagStat[]> {
        const response = await fetch(`${SolvedAcService.API_BASE}/user/problem_tag_stats?handle=${handle}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch tag stats for ${handle}`);
        }
        // The API returns an array directly
        const data = await response.json();
        return (data as any).items as SolvedAcTagStat[];
    }

    /**
     * Fetch user's top 100 solved problems (used for rating calculation)
     */
    async getUserTop100(handle: string): Promise<SolvedAcTop100Problem[]> {
        const response = await fetch(`${SolvedAcService.API_BASE}/user/top_100?handle=${encodeURIComponent(handle)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch top 100 for ${handle}`);
        }
        const data = await response.json();
        return data.items || [];
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
            const [userInfo, problemStats, tagStats, top100] = await Promise.all([
                this.getUserInfo(handle),
                this.getUserProblemStats(handle),
                this.getUserProblemTagStats(handle),
                this.getUserTop100(handle),
            ]);

            // Generate natural language summary in Korean
            const summary = this.generateSummaryFromStats(userInfo, problemStats, tagStats, top100);

            return {
                handle: userInfo.handle,
                rating: userInfo.rating,
                tier: userInfo.tier,
                solvedCount: userInfo.solvedCount,
                class: userInfo.class,
                problemStats,
                tagStats,
                top100,
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
        tagStats: SolvedAcTagStat[],
        top100: SolvedAcTop100Problem[]
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
            const topTags = sortedTags.slice(0, 5).filter(t => t.count > 0);

            if (topTags.length > 0) {
                const tagNames = topTags.map(t =>
                    `${this.getKoreanTagName(t.tag)} (${t.count}개)`
                );
                parts.push(`주요 알고리즘 분야는 ${tagNames.join(', ')}입니다.`);
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
            parts.push(`강점 분야는 ${proficientAreas.join(', ')}입니다.`);
        }

        // Weak areas
        if (weakAreas.length > 0) {
            parts.push(`보완이 필요한 분야는 ${weakAreas.join(', ')}입니다.`);
        }

        return parts.join(' ');
    }
}

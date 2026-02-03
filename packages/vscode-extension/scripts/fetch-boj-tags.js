#!/usr/bin/env node

/**
 * Pre-fetch ALL BOJ problem tags from solved.ac and save to JSON
 * Run this during development: npm run init-boj-tags
 *
 * This fetches EVERY problem on solved.ac, not just a subset.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://solved.ac/api/v3';
const RATE_LIMIT_DELAY = 50; // ms
const BATCH_SIZE = 100;

// Tag-based approach recommendations
const TAG_STRATEGIES = {
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

function generateRecommendedApproach(tags) {
    const approaches = [];

    for (const tag of tags) {
        if (TAG_STRATEGIES[tag]) {
            approaches.push(TAG_STRATEGIES[tag]);
        }
    }

    if (approaches.length === 0) {
        return 'Analyze the problem constraints and requirements carefully. Consider time/space complexity and choose appropriate algorithms.';
    }

    // Return up to 3 approaches
    return approaches.slice(0, 3).join(' ');
}

function getDifficultyName(level) {
    const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'];
    const tierIndex = Math.floor((level - 1) / 5);
    const subLevel = 5 - ((level - 1) % 5);

    if (tierIndex < 0 || tierIndex >= tiers.length) {
        return `Level ${level}`;
    }

    return `${tiers[tierIndex]} ${subLevel}`;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(page, size) {
    const url = `${API_BASE}/search/problem?query=&sort=id&direction=asc&page=${page}&size=${size}`;

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'AnimeGirlfriendVSCodeExtension/1.0'
        }
    });

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
}

async function getTotalProblemCount() {
    console.log('\n🔍 Getting total problem count from solved.ac...');

    const response = await fetchPage(1, 1);
    const totalCount = response.count;

    console.log(`✅ Total problems available: ${totalCount.toLocaleString()}`);
    return totalCount;
}

async function fetchAllProblems() {
    const problems = [];
    const seenIds = new Set(); // Track problem IDs to avoid duplicates

    // Get total count first
    const totalCount = await getTotalProblemCount();

    let page = 1;
    let totalFetched = 0;
    let consecutiveEmptyPages = 0;

    console.log(`\n🚀 Fetching ALL ${totalCount.toLocaleString()} BOJ problems from solved.ac...`);
    console.log('='.repeat(70));
    console.log('This will take a while. Go grab a coffee ☕\n');

    while (true) {
        try {
            const response = await fetchPage(page, BATCH_SIZE);

            if (!response || response.items.length === 0) {
                consecutiveEmptyPages++;

                if (consecutiveEmptyPages >= 3) {
                    console.log('\n✅ Reached end of problem list (3 consecutive empty pages)');
                    break;
                }

                page++;
                await sleep(RATE_LIMIT_DELAY);
                continue;
            }

            // Reset consecutive empty counter
            consecutiveEmptyPages = 0;

            for (const problem of response.items) {
                // Skip duplicates
                if (seenIds.has(problem.problemId)) {
                    console.log(`\n⚠️  Duplicate problem ${problem.problemId} detected, skipping...`);
                    continue;
                }

                seenIds.add(problem.problemId);

                const tags = problem.tags.map(tag => tag.key);
                const recommendedApproach = generateRecommendedApproach(tags);

                problems.push({
                    problemId: problem.problemId,
                    titleKo: problem.titleKo,
                    difficulty: problem.level,
                    difficultyName: getDifficultyName(problem.level),
                    tags,
                    recommendedApproach
                });

                totalFetched++;
            }

            // Progress indicator
            if (totalFetched % 100 === 0 || totalFetched === totalCount) {
                const percent = ((totalFetched / totalCount) * 100).toFixed(1);
                const progressBar = '█'.repeat(Math.floor(totalFetched / totalCount * 40));
                const emptyBar = '░'.repeat(40 - Math.floor(totalFetched / totalCount * 40));
                process.stdout.write(`\r📊 [${progressBar}${emptyBar}] ${totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${percent}%)`);
            }

            // Rate limiting
            await sleep(RATE_LIMIT_DELAY);
            page++;

            // Safety check - if we've fetched significantly more than expected, something is wrong
            if (totalFetched > totalCount + 1000) {
                console.log(`\n⚠️  Warning: Fetched ${totalFetched} problems but expected ${totalCount}. Stopping to prevent infinite loop.`);
                break;
            }

        } catch (error) {
            console.error(`\n❌ Failed to fetch page ${page}:`, error.message);
            console.log(`Retrying in ${RATE_LIMIT_DELAY * 2}ms...`);
            await sleep(RATE_LIMIT_DELAY * 2);
            // Don't increment page, retry the same page
        }
    }

    console.log(`\n\n✅ Successfully fetched ${problems.length.toLocaleString()} unique problems`);

    if (problems.length < totalCount * 0.95) {
        console.log(`⚠️  Warning: Only fetched ${problems.length} out of expected ${totalCount} problems`);
        console.log(`   This might be due to API pagination issues or rate limiting.`);
    }

    return problems;
}

async function main() {
    console.log('\n📥 BOJ Problem Tags Pre-Fetch Script');
    console.log('====================================');
    console.log(`Mode: Fetch ALL problems from solved.ac`);
    console.log(`Rate limit: ${RATE_LIMIT_DELAY}ms between requests\n`);

    const startTime = Date.now();

    try {
        // Fetch ALL problems
        const problems = await fetchAllProblems();

        // Create data directory if it doesn't exist
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Save to JSON file
        const outputPath = path.join(dataDir, 'boj-problem-tags.json');
        const data = {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            problemCount: problems.length,
            problems
        };

        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

        console.log('\n💾 Saved to:', outputPath);
        console.log(`📦 File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

        // Calculate time taken
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        console.log(`⏱️  Time taken: ${minutes}m ${seconds}s`);

        // Statistics
        const tagCounts = {};
        const difficultyCounts = {};

        problems.forEach(p => {
            p.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });

            const tier = p.difficultyName.split(' ')[0];
            difficultyCounts[tier] = (difficultyCounts[tier] || 0) + 1;
        });

        const topTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);

        console.log('\n📊 Statistics:');
        console.log('='.repeat(50));
        console.log('\n🏷️  Top 15 Algorithm Tags:');
        topTags.forEach(([tag, count]) => {
            console.log(`   ${tag.padEnd(25)} ${count.toLocaleString()} problems`);
        });

        console.log('\n🎯 Problems by Difficulty:');
        Object.entries(difficultyCounts)
            .sort((a, b) => {
                const order = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'];
                return order.indexOf(a[0]) - order.indexOf(b[0]);
            })
            .forEach(([tier, count]) => {
                console.log(`   ${tier.padEnd(10)} ${count.toLocaleString()} problems`);
            });

        console.log('\n✅ Pre-fetch complete!');
        console.log('\nNext steps:');
        console.log('1. The tags are now bundled with your extension');
        console.log('2. On first launch, they will be loaded into the vector database (<5s)');
        console.log('3. No network calls needed at runtime!\n');

    } catch (error) {
        console.error('\n❌ Pre-fetch failed:', error);
        process.exit(1);
    }
}

main();

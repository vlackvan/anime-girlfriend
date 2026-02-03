#!/usr/bin/env node

/**
 * Database Inspector for BOJ Problem Tags
 *
 * Usage:
 *   node inspect-db.js stats              - Show database statistics
 *   node inspect-db.js list [limit]       - List problems (default: 20)
 *   node inspect-db.js search <id>        - Search for specific problem
 *   node inspect-db.js tags               - Show all unique tags
 *   node inspect-db.js difficulty <name>  - Find problems by difficulty
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'anime_girlfriend_rag',
    user: 'postgres',
    password: 'postgres',
});

async function showStats() {
    const result = await pool.query(`
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE metadata->>'type' = 'boj_tag') as tags,
            COUNT(*) FILTER (WHERE metadata->>'type' = 'solution') as solutions,
            COUNT(*) FILTER (WHERE metadata->>'type' = 'conversation') as conversations
        FROM documents
    `);

    console.log('\n📊 Database Statistics');
    console.log('======================');
    console.log(`Total Documents:  ${result.rows[0].total}`);
    console.log(`BOJ Tags:         ${result.rows[0].tags}`);
    console.log(`Solutions:        ${result.rows[0].solutions}`);
    console.log(`Conversations:    ${result.rows[0].conversations}\n`);
}

async function listProblems(limit = 20) {
    const result = await pool.query(`
        SELECT
            metadata->>'problemId' as id,
            metadata->>'title' as title,
            metadata->>'difficultyName' as difficulty,
            metadata->>'tags' as tags
        FROM documents
        WHERE metadata->>'type' = 'boj_tag'
        ORDER BY (metadata->>'problemId')::int
        LIMIT $1
    `, [limit]);

    console.log(`\n📋 BOJ Problems (showing ${result.rows.length})`);
    console.log('='.repeat(80));

    result.rows.forEach(row => {
        const tags = JSON.parse(row.tags || '[]').join(', ');
        console.log(`${row.id.padEnd(6)} | ${row.title.padEnd(30)} | ${row.difficulty.padEnd(12)} | ${tags}`);
    });
    console.log();
}

async function searchProblem(problemId) {
    const result = await pool.query(`
        SELECT content, metadata
        FROM documents
        WHERE metadata->>'problemId' = $1 AND metadata->>'type' = 'boj_tag'
    `, [problemId]);

    if (result.rows.length === 0) {
        console.log(`\n❌ Problem ${problemId} not found in database.\n`);
        return;
    }

    const doc = result.rows[0];
    const meta = doc.metadata;

    console.log(`\n🔍 Problem ${problemId}: ${meta.title}`);
    console.log('='.repeat(80));
    console.log(`Difficulty:   ${meta.difficultyName} (Level ${meta.difficulty})`);
    console.log(`Tags:         ${meta.tags.join(', ')}`);
    console.log(`\nRecommended Approach:`);
    console.log(meta.recommendedApproach);
    console.log(`\nIngested:     ${new Date(meta.ingestedAt).toLocaleString()}`);
    console.log();
}

async function showUniqueTags() {
    const result = await pool.query(`
        SELECT DISTINCT jsonb_array_elements_text(metadata->'tags') as tag
        FROM documents
        WHERE metadata->>'type' = 'boj_tag'
        ORDER BY tag
    `);

    console.log(`\n🏷️  Unique Algorithm Tags (${result.rows.length} total)`);
    console.log('='.repeat(80));

    const tags = result.rows.map(r => r.tag);
    for (let i = 0; i < tags.length; i += 5) {
        console.log(tags.slice(i, i + 5).join(', '));
    }
    console.log();
}

async function findByDifficulty(difficulty) {
    const result = await pool.query(`
        SELECT
            metadata->>'problemId' as id,
            metadata->>'title' as title,
            metadata->>'tags' as tags
        FROM documents
        WHERE metadata->>'type' = 'boj_tag'
        AND metadata->>'difficultyName' ILIKE $1
        ORDER BY (metadata->>'problemId')::int
        LIMIT 20
    `, [`%${difficulty}%`]);

    console.log(`\n📊 Problems matching "${difficulty}" (showing ${result.rows.length})`);
    console.log('='.repeat(80));

    result.rows.forEach(row => {
        const tags = JSON.parse(row.tags || '[]').join(', ');
        console.log(`${row.id.padEnd(6)} | ${row.title.padEnd(40)} | ${tags}`);
    });
    console.log();
}

async function main() {
    const command = process.argv[2];
    const arg = process.argv[3];

    try {
        switch (command) {
            case 'stats':
                await showStats();
                break;
            case 'list':
                await listProblems(parseInt(arg) || 20);
                break;
            case 'search':
                if (!arg) {
                    console.log('Usage: node inspect-db.js search <problem_id>');
                    process.exit(1);
                }
                await searchProblem(arg);
                break;
            case 'tags':
                await showUniqueTags();
                break;
            case 'difficulty':
                if (!arg) {
                    console.log('Usage: node inspect-db.js difficulty <difficulty_name>');
                    console.log('Example: node inspect-db.js difficulty "Silver 1"');
                    process.exit(1);
                }
                await findByDifficulty(arg);
                break;
            default:
                console.log(`
BOJ Database Inspector
======================

Usage:
  node inspect-db.js stats              - Show database statistics
  node inspect-db.js list [limit]       - List problems (default: 20)
  node inspect-db.js search <id>        - Search for specific problem
  node inspect-db.js tags               - Show all unique tags
  node inspect-db.js difficulty <name>  - Find problems by difficulty

Examples:
  node inspect-db.js stats
  node inspect-db.js list 50
  node inspect-db.js search 1149
  node inspect-db.js difficulty "Silver 1"
  node inspect-db.js tags
                `);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

main();

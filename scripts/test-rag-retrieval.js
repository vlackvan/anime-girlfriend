#!/usr/bin/env node

/**
 * Test RAG Retrieval System
 *
 * This script verifies that the vector database is being queried correctly
 * and returns relevant BOJ problem tags.
 */

const { Pool } = require('pg');
const { pipeline } = require('@xenova/transformers');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'anime_girlfriend_rag',
    user: 'postgres',
    password: 'postgres',
});

let embeddingPipeline;

async function initEmbedding() {
    console.log('🧠 Loading embedding model...');
    embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
    );
    console.log('✅ Model loaded\n');
}

async function generateEmbedding(text) {
    const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

async function testQuery(query, description) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 TEST: ${description}`);
    console.log(`Query: "${query}"`);
    console.log('='.repeat(80));

    // Generate embedding for query
    const embedding = await generateEmbedding(query);

    // Search in vector database
    const result = await pool.query(`
        SELECT
            d.id,
            d.content,
            d.metadata,
            1 - (e.embedding <=> $1::vector) as similarity
        FROM embeddings e
        JOIN documents d ON e.document_id = d.id
        WHERE 1 - (e.embedding <=> $1::vector) >= 0.3
        ORDER BY e.embedding <=> $1::vector
        LIMIT 5
    `, [`[${embedding.join(',')}]`]);

    if (result.rows.length === 0) {
        console.log('❌ No documents found (RAG not working or threshold too high)');
        return false;
    }

    console.log(`\n✅ Found ${result.rows.length} relevant documents:\n`);

    result.rows.forEach((row, idx) => {
        const meta = row.metadata;
        const similarity = (row.similarity * 100).toFixed(1);

        console.log(`${idx + 1}. [${similarity}% match] ${meta.type}`);

        if (meta.type === 'boj_tag') {
            console.log(`   Problem ${meta.problemId}: ${meta.title}`);
            console.log(`   Difficulty: ${meta.difficultyName}`);
            console.log(`   Tags: ${meta.tags.join(', ')}`);
            console.log(`   Approach: ${meta.recommendedApproach.substring(0, 80)}...`);
        } else if (meta.type === 'conversation') {
            console.log(`   Conversation from ${new Date(meta.timestamp).toLocaleString()}`);
        } else if (meta.type === 'solution') {
            console.log(`   Solution for problem ${meta.problemId} in ${meta.language}`);
        }
        console.log();
    });

    return true;
}

async function testBOJSpecific(problemId) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 TEST: BOJ Problem-Specific Query`);
    console.log(`Problem ID: ${problemId}`);
    console.log('='.repeat(80));

    // Direct metadata search
    const result = await pool.query(`
        SELECT
            d.content,
            d.metadata
        FROM documents d
        WHERE d.metadata->>'problemId' = $1
        AND d.metadata->>'type' = 'boj_tag'
        LIMIT 1
    `, [problemId]);

    if (result.rows.length === 0) {
        console.log(`❌ Problem ${problemId} not found in database`);
        return false;
    }

    const meta = result.rows[0].metadata;
    console.log(`\n✅ Found problem in database:\n`);
    console.log(`Problem ${meta.problemId}: ${meta.title}`);
    console.log(`Difficulty: ${meta.difficultyName} (Level ${meta.difficulty})`);
    console.log(`Tags: ${meta.tags.join(', ')}`);
    console.log(`\nRecommended Approach:`);
    console.log(meta.recommendedApproach);
    console.log();

    return true;
}

async function testChatGPTKnowledge() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🤔 CONTROL TEST: ChatGPT's Built-in Knowledge`);
    console.log('='.repeat(80));
    console.log(`
This test checks if the AI would know about specific BOJ problems WITHOUT RAG.

ChatGPT's training data (cutoff 2023) includes:
- General algorithms (DP, graphs, etc.)
- Common problems from public competitive programming sites
- BUT: Specific BOJ problem metadata, tags, and Korean titles are unlikely

If the AI mentions:
✅ Specific Korean problem titles → RAG is working
✅ Exact difficulty levels (Silver 1, Gold 3) → RAG is working
✅ solved.ac tags → RAG is working
❌ Generic algorithm advice without specifics → Using built-in knowledge
    `);
}

async function main() {
    console.log('\n🧪 RAG System Verification Test');
    console.log('================================\n');

    try {
        // Initialize embedding model
        await initEmbedding();

        // Test 1: Specific BOJ problem query
        await testBOJSpecific('1149');

        // Test 2: Natural language query about specific problem
        await testQuery(
            '1149번 RGB거리 문제 어떻게 풀어?',
            'Natural language query for specific problem'
        );

        // Test 3: General algorithm query
        await testQuery(
            '다이나믹 프로그래밍 문제 추천해줘',
            'General algorithm category query'
        );

        // Test 4: Difficulty-based query
        await testQuery(
            'Silver 1 level graph problems',
            'Difficulty + algorithm query'
        );

        // Show how to distinguish ChatGPT knowledge from RAG
        await testChatGPTKnowledge();

        console.log(`\n${'='.repeat(80)}`);
        console.log('✅ All tests completed!');
        console.log('='.repeat(80));
        console.log(`
How to verify RAG is working in the extension:

1. Open VS Code Developer Tools (Help → Toggle Developer Tools)
2. Go to the Console tab
3. Ask Chihiro: "1149번 어떻게 풀어?"
4. Look for log messages:
   - "[ChatGPTService] 🎯 Detected BOJ problem: 1149"
   - "[ChatGPTService] 📚 Retrieved X documents from RAG"
   - "[ChatGPTService] 🏷️  Document types: boj_tag"

If you see these logs → RAG is working!
If you don't see these logs → RAG is not being queried

5. Or use the command: "Anime Girlfriend: RAG: Test Query (Debug)"
   - Enter a test query
   - See exactly what RAG retrieves
        `);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

main();

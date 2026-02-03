const { Pool } = require('pg');
const { pipeline } = require('@xenova/transformers');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'anime_girlfriend_rag',
    user: 'postgres',
    password: 'postgres',
});

async function test() {
    const embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const query = '1149번 어떻게 풀어?';
    console.log(`Query: "${query}"\n`);

    const output = await embeddingPipeline(query, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    const result = await pool.query(`
        SELECT
            d.metadata->>'problemId' as id,
            d.metadata->>'title' as title,
            d.metadata->>'type' as type,
            1 - (e.embedding <=> $1::vector) as similarity
        FROM embeddings e
        JOIN documents d ON e.document_id = d.id
        WHERE d.metadata->>'problemId' = '1149'
        OR d.metadata->>'title' LIKE '%RGB%'
        ORDER BY similarity DESC
        LIMIT 10
    `, [`[${embedding.join(',')}]`]);

    console.log('Results for problem 1149:');
    result.rows.forEach(row => {
        console.log(`- Problem ${row.id}: ${row.title} (${row.type})`);
        console.log(`  Similarity: ${(row.similarity * 100).toFixed(2)}%\n`);
    });

    // Now try searching with lower threshold
    const result2 = await pool.query(`
        SELECT
            d.metadata->>'problemId' as id,
            d.metadata->>'title' as title,
            d.metadata->>'type' as type,
            1 - (e.embedding <=> $1::vector) as similarity
        FROM embeddings e
        JOIN documents d ON e.document_id = d.id
        WHERE 1 - (e.embedding <=> $1::vector) >= 0.0
        ORDER BY similarity DESC
        LIMIT 5
    `, [`[${embedding.join(',')}]`]);

    console.log('\nTop 5 results (any similarity):');
    result2.rows.forEach(row => {
        console.log(`- Problem ${row.id}: ${row.title} (${row.type})`);
        console.log(`  Similarity: ${(row.similarity * 100).toFixed(2)}%\n`);
    });

    await pool.end();
}

test().catch(console.error);

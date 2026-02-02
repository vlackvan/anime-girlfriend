/**
 * RAG System Integration Test
 *
 * This script tests the entire RAG pipeline:
 * 1. Embedding generation
 * 2. Document storage in PostgreSQL
 * 3. Similarity search
 * 4. Context retrieval
 *
 * Prerequisites:
 * - PostgreSQL with pgvector running (docker-compose up)
 * - Dependencies installed (npm install)
 *
 * Usage:
 * node test-rag.js
 */

const { Pool } = require('pg');

// Test configuration
const config = {
    host: 'localhost',
    port: 5432,
    database: 'anime_girlfriend_rag',
    user: 'postgres',
    password: 'postgres',
};

async function testDatabaseConnection() {
    console.log('\n📡 Testing database connection...');

    const pool = new Pool(config);

    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ Database connected successfully');
        console.log('   Server time:', result.rows[0].now);
        client.release();
        await pool.end();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('\n💡 Make sure PostgreSQL is running:');
        console.log('   docker-compose up -d');
        return false;
    }
}

async function testPgvectorExtension() {
    console.log('\n🔌 Testing pgvector extension...');

    const pool = new Pool(config);

    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT extname, extversion
            FROM pg_extension
            WHERE extname = 'vector'
        `);

        if (result.rows.length > 0) {
            console.log('✅ pgvector extension installed');
            console.log('   Version:', result.rows[0].extversion);
        } else {
            console.log('❌ pgvector extension not found');
        }

        client.release();
        await pool.end();
        return result.rows.length > 0;
    } catch (error) {
        console.error('❌ Extension check failed:', error.message);
        return false;
    }
}

async function testSchemaCreation() {
    console.log('\n📋 Testing schema creation...');

    const pool = new Pool(config);

    try {
        const client = await pool.connect();

        // Check documents table
        const docResult = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'documents'
        `);

        // Check embeddings table
        const embResult = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'embeddings'
        `);

        // Check HNSW index
        const idxResult = await client.query(`
            SELECT indexname
            FROM pg_indexes
            WHERE indexname = 'embeddings_embedding_idx'
        `);

        console.log('✅ Schema check:');
        console.log('   Documents table:', docResult.rows.length > 0 ? 'exists' : 'missing');
        console.log('   Embeddings table:', embResult.rows.length > 0 ? 'exists' : 'missing');
        console.log('   HNSW index:', idxResult.rows.length > 0 ? 'exists' : 'missing');

        client.release();
        await pool.end();
        return docResult.rows.length > 0 && embResult.rows.length > 0;
    } catch (error) {
        console.error('❌ Schema check failed:', error.message);
        return false;
    }
}

async function testEmbeddingGeneration() {
    console.log('\n🧠 Testing embedding generation...');
    console.log('   (This will download the model on first run, ~100MB)');

    try {
        const { pipeline } = await import('@xenova/transformers');

        console.log('   Loading model...');
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true,
        });

        const testText = 'This is a test sentence for embedding generation.';
        console.log('   Generating embedding...');

        const output = await extractor(testText, {
            pooling: 'mean',
            normalize: true,
        });

        const embedding = Array.from(output.data);

        console.log('✅ Embedding generated successfully');
        console.log('   Dimensions:', embedding.length);
        console.log('   Sample values:', embedding.slice(0, 5).map(v => v.toFixed(4)).join(', '), '...');

        return embedding.length === 384;
    } catch (error) {
        console.error('❌ Embedding generation failed:', error.message);
        return false;
    }
}

async function testEndToEnd() {
    console.log('\n🔄 Testing end-to-end RAG pipeline...');

    const pool = new Pool(config);

    try {
        const client = await pool.connect();

        // Step 1: Insert test document
        console.log('   1. Inserting test document...');
        const docResult = await client.query(
            'INSERT INTO documents (content, metadata) VALUES ($1, $2) RETURNING id',
            [
                'Baekjoon Problem 1000\nLanguage: C++\nThis is a simple A+B problem solution.',
                JSON.stringify({ problemId: '1000', language: 'C++', type: 'test' })
            ]
        );
        const docId = docResult.rows[0].id;
        console.log('   ✓ Document inserted:', docId);

        // Step 2: Generate and insert embedding
        console.log('   2. Generating embedding...');
        const { pipeline } = await import('@xenova/transformers');
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true,
        });

        const output = await extractor('Baekjoon Problem 1000 A+B solution', {
            pooling: 'mean',
            normalize: true,
        });

        const embedding = Array.from(output.data);
        const vectorString = `[${embedding.join(',')}]`;

        console.log('   3. Inserting embedding...');
        await client.query(
            'INSERT INTO embeddings (document_id, embedding) VALUES ($1, $2::vector)',
            [docId, vectorString]
        );
        console.log('   ✓ Embedding inserted');

        // Step 3: Perform similarity search
        console.log('   4. Performing similarity search...');
        const queryText = 'How to solve A+B problem';
        const queryOutput = await extractor(queryText, {
            pooling: 'mean',
            normalize: true,
        });

        const queryEmbedding = Array.from(queryOutput.data);
        const queryVectorString = `[${queryEmbedding.join(',')}]`;

        const searchResult = await client.query(
            `
            SELECT
                d.id,
                d.content,
                d.metadata,
                1 - (e.embedding <=> $1::vector) as similarity
            FROM embeddings e
            JOIN documents d ON e.document_id = d.id
            WHERE d.metadata->>'type' = 'test'
            ORDER BY e.embedding <=> $1::vector
            LIMIT 5
            `,
            [queryVectorString]
        );

        console.log('   ✓ Search complete');
        console.log('   Results found:', searchResult.rows.length);

        if (searchResult.rows.length > 0) {
            console.log('   Top result similarity:', (searchResult.rows[0].similarity * 100).toFixed(2) + '%');
        }

        // Cleanup
        console.log('   5. Cleaning up test data...');
        await client.query('DELETE FROM documents WHERE metadata->>\'type\' = \'test\'');
        console.log('   ✓ Cleanup complete');

        client.release();
        await pool.end();

        console.log('\n✅ End-to-end test passed!');
        return true;
    } catch (error) {
        console.error('❌ End-to-end test failed:', error.message);
        console.error(error);
        await pool.end();
        return false;
    }
}

async function runTests() {
    console.log('🧪 RAG System Integration Tests');
    console.log('================================\n');

    const results = {
        connection: await testDatabaseConnection(),
        pgvector: false,
        schema: false,
        embedding: false,
        endToEnd: false,
    };

    if (!results.connection) {
        console.log('\n❌ Tests aborted: Database connection failed');
        console.log('   Please start PostgreSQL: docker-compose up -d');
        return;
    }

    results.pgvector = await testPgvectorExtension();
    results.schema = await testSchemaCreation();

    if (!results.schema) {
        console.log('\n⚠️  Schema not initialized. Run the extension first to create tables.');
    }

    results.embedding = await testEmbeddingGeneration();

    if (results.connection && results.pgvector && results.schema && results.embedding) {
        results.endToEnd = await testEndToEnd();
    }

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log('Database Connection:', results.connection ? '✅' : '❌');
    console.log('pgvector Extension:', results.pgvector ? '✅' : '❌');
    console.log('Schema Creation:', results.schema ? '✅' : '❌');
    console.log('Embedding Generation:', results.embedding ? '✅' : '❌');
    console.log('End-to-End Pipeline:', results.endToEnd ? '✅' : '❌');

    const allPassed = Object.values(results).every(r => r);

    if (allPassed) {
        console.log('\n🎉 All tests passed! RAG system is ready.');
    } else {
        console.log('\n⚠️  Some tests failed. Check the output above for details.');
    }
}

// Run tests
runTests().catch(error => {
    console.error('\n💥 Test runner crashed:', error);
    process.exit(1);
});

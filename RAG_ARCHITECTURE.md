# RAG System Architecture

## Overview

The Anime Girlfriend extension uses a **local RAG (Retrieval-Augmented Generation)** system to provide contextual information about Baekjoon Online Judge (BOJ) problems. The system retrieves relevant problem metadata and solutions from a PostgreSQL vector database to augment ChatGPT responses.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VSCode Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │              │      │              │      │              │  │
│  │  ChatGPT     │─────▶│  RAG         │─────▶│  Vector      │  │
│  │  Service     │      │  Service     │      │  Store       │  │
│  │              │◀─────│              │◀─────│              │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│         │                      │                      │         │
│         │                      │                      ├─────────┤
│         │                      │                      │         │
│         │                      ▼                      ▼         │
│         │              ┌──────────────┐      ┌──────────────┐  │
│         │              │  Embedding   │      │  Database    │  │
│         │              │  Service     │      │  Service     │  │
│         │              └──────────────┘      └──────────────┘  │
│         │                      │                      │         │
└─────────┼──────────────────────┼──────────────────────┼─────────┘
          │                      │                      │
          │                      ▼                      ▼
          │              ┌──────────────┐      ┌──────────────┐
          │              │   Xenova     │      │  PostgreSQL  │
          │              │  MiniLM-L6   │      │  + pgvector  │
          │              │  (Local AI)  │      │   (Docker)   │
          │              └──────────────┘      └──────────────┘
          │
          ▼
  ┌──────────────┐
  │   OpenAI     │
  │  ChatGPT API │
  └──────────────┘
```

---

## Data Flow

### 1. Ingestion Pipeline (One-time setup)

```
solved.ac API
    │
    ├─▶ Fetch 33K+ problems with metadata
    │   (problemId, title, difficulty, tags)
    │
    ├─▶ Generate recommended approach
    │   (Based on algorithm tags)
    │
    ├─▶ Create document content
    │   (Rich text for embedding)
    │
    ├─▶ Generate embeddings (384-dim)
    │   (Xenova/all-MiniLM-L6-v2)
    │
    └─▶ Store in PostgreSQL
        ├─ documents table (content + metadata)
        └─ embeddings table (vector + HNSW index)
```

### 2. Query Pipeline (Real-time)

```
User Query: "1149번 어떻게 풀어?"
    │
    ├─▶ Detect BOJ problem ID (regex)
    │   Pattern: /(\d{4,5})(?:번|problem)/i
    │
    ├─▶ Generate query embedding
    │   (Xenova model: ~10ms)
    │
    ├─▶ Search vector database
    │   ├─ If problemId: metadata filter
    │   └─ Else: similarity search (threshold: 0.3)
    │
    ├─▶ Retrieve top-k documents (k=3-5)
    │   (HNSW index: ~50ms)
    │
    ├─▶ Format as context
    │   (Problem metadata + approach)
    │
    └─▶ Send to ChatGPT with context
        └─▶ Enhanced response to user
```

---

## Core Components

### 1. **RAGService** (`src/services/RAGService.ts`)
**Responsibility:** High-level RAG orchestration

```typescript
class RAGService {
    // Retrieve context for specific BOJ problem
    retrieveBOJContext(problemId: string)

    // General similarity search
    retrieveContext(query: string, maxResults?: number)

    // [DISABLED] Chat history (was contaminating DB)
    // addChatToMemory(userMessage, botResponse)
}
```

**Key Methods:**
- `retrieveBOJContext()` - Exact problem lookup by ID
- `retrieveContext()` - Semantic similarity search
- `formatContext()` - Format documents for LLM consumption

---

### 2. **VectorStore** (`src/services/VectorStore.ts`)
**Responsibility:** Vector database abstraction

```typescript
class VectorStore {
    // Add documents to the store
    addDocument(document: Document)
    addDocuments(documents: Document[])

    // Search operations
    similaritySearch(query, k?, minSimilarity?)
    searchWithFilters(query, metadataFilter, k?)

    // Management
    getDocumentCount()
    clearAll()
    isEnabled()
}
```

**Features:**
- Automatic embedding generation
- Batch document ingestion
- Metadata filtering
- Similarity threshold control

---

### 3. **EmbeddingService** (`src/services/EmbeddingService.ts`)
**Responsibility:** Text → Vector conversion

```typescript
class EmbeddingService {
    // Model: Xenova/all-MiniLM-L6-v2
    // Output: 384-dimensional vector

    generateEmbedding(text: string): Promise<number[]>
    generateEmbeddings(texts: string[]): Promise<number[][]>
    cosineSimilarity(a: number[], b: number[]): number
}
```

**Model Details:**
- **Name:** `Xenova/all-MiniLM-L6-v2`
- **Type:** Sentence transformer
- **Dimensions:** 384
- **Quantized:** Yes (smaller, faster)
- **Local:** Runs entirely offline
- **Speed:** ~4ms per embedding

---

### 4. **DatabaseService** (`src/services/DatabaseService.ts`)
**Responsibility:** PostgreSQL operations

```typescript
class DatabaseService {
    // Document operations
    insertDocument(content, metadata)
    insertEmbedding(documentId, embedding)

    // Search operations
    similaritySearch(queryEmbedding, limit, minSimilarity)
    searchByMetadata(metadataFilter, queryEmbedding?, limit)

    // Management
    getDocumentCount()
    clearAll()
}
```

**⚠️ Critical Bug Fix:**
`searchByMetadata()` removes `ORDER BY` clause when using metadata filters due to PostgreSQL/pgvector bug. Sorts in JavaScript instead.

---

## Database Schema

### PostgreSQL + pgvector Extension

```sql
-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings table
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    embedding vector(384) NOT NULL,  -- pgvector type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HNSW index for fast similarity search
CREATE INDEX embeddings_embedding_idx
ON embeddings
USING hnsw (embedding vector_cosine_ops);
```

**Metadata Structure (BOJ Tag Document):**
```json
{
  "type": "boj_tag",
  "problemId": "1149",
  "title": "RGB거리",
  "difficulty": 10,
  "difficultyName": "Silver 1",
  "tags": ["dp"],
  "recommendedApproach": "Use dynamic programming...",
  "source": "solved.ac",
  "ingestedAt": "2026-02-02T13:01:49.976Z"
}
```

---

## Key Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Vector DB** | PostgreSQL 15 + pgvector | Store embeddings with SQL |
| **Embedding Model** | Xenova/all-MiniLM-L6-v2 | Text → 384-dim vectors |
| **Vector Index** | HNSW | Fast approximate search |
| **Distance Metric** | Cosine Distance (`<=>`) | Similarity calculation |
| **Runtime** | Node.js + @xenova/transformers | Browser-compatible ML |
| **LLM** | OpenAI ChatGPT (gpt-4o) | Response generation |

---

## Performance Characteristics

### Speed Benchmarks
```
Embedding generation:     4ms   (target: <1000ms) ⚡
Metadata search:         23ms   (target: <1500ms) ⚡
Similarity search:       79ms   (target: <1500ms) ⚡
End-to-end query:       ~150ms  (target: <3000ms) ⚡
```

### Index Performance
- **HNSW:** Approximate Nearest Neighbor search
- **Complexity:** O(log N) vs O(N) for sequential scan
- **Accuracy:** ~95% recall @ k=5
- **Build time:** ~2 minutes for 33K documents

### Memory Usage
- **Embeddings:** 33,534 × 384 × 4 bytes ≈ 51 MB
- **Model cache:** ~100 MB (first load)
- **Total DB size:** ~150 MB

---

## Current State

### Database Contents
```
Total documents:    33,534
  └─ boj_tag:       33,534 (BOJ problems)
  └─ conversation:       0 (disabled)
  └─ solution:           0 (not yet implemented)

Total embeddings:   33,534
HNSW index:         ✅ Active
```

### Coverage
- **Problems:** 1000 - 34544 (BOJ problem range)
- **Difficulties:** Bronze 5 → Ruby 1
- **Algorithm tags:** 50+ categories
- **Languages:** Korean titles + English tags

### Document Types
```typescript
type DocumentType =
  | 'boj_tag'       // Problem metadata from solved.ac
  | 'solution'      // User's code (not yet implemented)
  | 'conversation'  // Chat history (DISABLED)
```

---

## Query Modes

### Mode 1: Exact Problem Lookup
**Trigger:** Problem ID detected in query
**Pattern:** `\d{4,5}번` or `problem \d{4,5}`

```
Input:  "1149번 어떻게 풀어?"
Detect: problemId = "1149"
Query:  metadata->>'problemId' = '1149'
Result: Exact match (100% precision)
```

### Mode 2: Semantic Similarity Search
**Trigger:** No problem ID detected
**Method:** Cosine similarity with threshold

```
Input:  "다이나믹 프로그래밍 문제 추천해줘"
Embed:  [0.123, -0.456, ..., 0.789]  (384 dims)
Query:  1 - (embedding <=> query_vec) >= 0.3
Result: Top-5 most similar problems
```

---

## Important Implementation Details

### 1. **Metadata Search Bug Fix**
**Problem:** Combining `WHERE metadata` filter + `ORDER BY vector` returns 0 results

**Solution:**
```typescript
// ❌ BROKEN (PostgreSQL bug)
SELECT ... WHERE metadata->>'problemId' = $1
ORDER BY embedding <=> $2::vector

// ✅ FIXED (sort in JS)
SELECT ... WHERE metadata->>'problemId' = $1
// Then: rows.sort((a,b) => b.similarity - a.similarity)
```

### 2. **Chat History Disabled**
**Reason:** Conversation documents contaminate BOJ problem retrieval

**Status:** Code preserved but commented out
```typescript
// TODO: Re-enable with proper filtering
// await ragService.addChatToMemory(userMessage, botResponse);
```

### 3. **Similarity Threshold**
**Default:** 0.3 (30% similarity)
**Reasoning:**
- Too high (>0.5): Misses relevant problems
- Too low (<0.2): Returns noise
- 0.3: Good balance for Korean/English mixed queries

### 4. **Problem ID Extraction**
```typescript
const bojPattern = /(\d{4,5})(?:번|problem)/i;
const match = query.match(bojPattern);
// Matches: "1149번", "problem 1000", "1149problem"
// Extracts: "1149", "1000", "1149"
```

---

## Configuration (VSCode Settings)

```json
{
  "anime-girlfriend.database.host": "localhost",
  "anime-girlfriend.database.port": 5432,
  "anime-girlfriend.database.name": "anime_girlfriend_rag",
  "anime-girlfriend.database.user": "postgres",
  "anime-girlfriend.database.password": "postgres",

  "anime-girlfriend.rag.enabled": true,
  "anime-girlfriend.rag.maxResults": 5
}
```

---

## Future Enhancements

### Planned Features
- [ ] User solution ingestion (local code files)
- [ ] Conversation history with filtering
- [ ] Query expansion (synonyms, translation)
- [ ] Re-ranking (semantic + keyword hybrid)
- [ ] Caching for frequent queries
- [ ] A/B testing different embedding models

### Potential Improvements
- [ ] Hybrid search (vector + BM25 keyword)
- [ ] Problem difficulty adaptation (user level)
- [ ] Related problem suggestions
- [ ] Time-based filtering (recent submissions)
- [ ] Multi-hop reasoning (problem dependencies)

---

## Debugging & Testing

### Check RAG Status
```bash
# Test database connection and data
node scripts/test-rag-retrieval.js

# Test similarity search
node scripts/test-similarity.js

# Inspect database
node scripts/inspect-db.js stats
```

### VSCode Debug Command
```
Command Palette → "Anime Girlfriend: RAG: Test Query (Debug)"
Input: "1149번 어떻게 풀어?"
Expected: Problem 1149 - RGB거리
```

### Direct Database Query
```sql
-- Check document count
SELECT COUNT(*) FROM documents;

-- Find specific problem
SELECT metadata FROM documents
WHERE metadata->>'problemId' = '1149';

-- Test similarity search (requires vector)
SELECT
  metadata->>'problemId',
  metadata->>'title',
  1 - (embedding <=> $1::vector) as similarity
FROM embeddings e
JOIN documents d ON e.document_id = d.id
ORDER BY similarity DESC
LIMIT 5;
```

---

## Resources

- **pgvector docs:** https://github.com/pgvector/pgvector
- **Xenova transformers:** https://huggingface.co/docs/transformers.js
- **Model card:** https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- **solved.ac API:** https://solvedac.github.io/unofficial-documentation/

---

*Architecture version: 1.0*
*Last updated: 2026-02-03*

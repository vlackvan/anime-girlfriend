# Scripts

Utility scripts for the Anime Girlfriend RAG system.

## Test Scripts

### `test-rag-retrieval.js`
**Purpose:** Test and verify RAG retrieval functionality

**Usage:**
```bash
node scripts/test-rag-retrieval.js
```

**What it does:**
- Tests metadata search for specific problem IDs
- Tests natural language queries
- Tests general algorithm category queries
- Tests difficulty-based queries
- Provides examples of expected RAG behavior

**When to use:**
- After making changes to RAG retrieval logic
- When debugging search issues
- To understand how queries are processed

---

### `test-similarity.js`
**Purpose:** Test vector similarity search

**Usage:**
```bash
node scripts/test-similarity.js
```

**What it does:**
- Tests embedding generation
- Tests cosine similarity calculations
- Tests vector search with different thresholds
- Benchmarks search performance

**When to use:**
- When debugging similarity scores
- To test embedding model changes
- To verify HNSW index performance

---

## Utility Scripts

### `inspect-db.js`
**Purpose:** Database inspection and exploration tool

**Usage:**
```bash
# Show database statistics
node scripts/inspect-db.js stats

# List problems (default: 20)
node scripts/inspect-db.js list [limit]

# Search for specific problem
node scripts/inspect-db.js search <problemId>

# Show all unique algorithm tags
node scripts/inspect-db.js tags

# Find problems by difficulty
node scripts/inspect-db.js difficulty <name>
```

**Examples:**
```bash
# View database stats
node scripts/inspect-db.js stats

# List first 50 problems
node scripts/inspect-db.js list 50

# Search for problem 1149
node scripts/inspect-db.js search 1149

# Show all tags
node scripts/inspect-db.js tags

# Find Silver 1 problems
node scripts/inspect-db.js difficulty "Silver 1"
```

**When to use:**
- To explore database contents
- To verify ingestion worked correctly
- To find problems by difficulty or tags
- To check data quality

---

## Prerequisites

All scripts require:
- Node.js installed
- PostgreSQL with pgvector running
- Dependencies installed (`npm install` in project root)

**Start PostgreSQL:**
```bash
docker-compose up -d
```

---

## Common Tasks

### Verify RAG is working
```bash
node scripts/test-rag-retrieval.js
```

### Check how many problems are in DB
```bash
node scripts/inspect-db.js stats
```

### Find all DP problems
```bash
# Use the inspect-db tool
node scripts/inspect-db.js tags
# Then search in output for "dp"
```

### Test a specific query
```bash
# Use VSCode extension
# Command Palette → "Anime Girlfriend: RAG: Test Query (Debug)"
```

---

## Adding New Scripts

When adding new scripts to this folder:

1. **Use shebang line:** `#!/usr/bin/env node`
2. **Add executable permission:** `chmod +x scripts/your-script.js`
3. **Document usage in header comment**
4. **Update this README**

**Template:**
```javascript
#!/usr/bin/env node

/**
 * Script Name
 *
 * Brief description of what it does
 *
 * Usage:
 *   node scripts/your-script.js [args]
 */

// Your code here
```

---

## Troubleshooting

### "Error: connect ECONNREFUSED"
**Problem:** PostgreSQL is not running

**Solution:**
```bash
docker-compose up -d
```

### "Error: Cannot find module 'pg'"
**Problem:** Dependencies not installed

**Solution:**
```bash
npm install
```

### "Error: relation 'documents' does not exist"
**Problem:** Database schema not initialized

**Solution:** Run the extension once to initialize schema, or run:
```bash
node packages/vscode-extension/test-rag.js
```

---

*Last updated: 2026-02-03*

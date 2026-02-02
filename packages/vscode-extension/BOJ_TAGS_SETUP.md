# BOJ Tags Pre-Fetch System

## Overview

BOJ problem tags are now **pre-fetched during development** and **bundled with the extension**. This eliminates:
- ❌ Slow startup (no 3-5 minute wait)
- ❌ Network dependency (solved.ac API)
- ❌ Potential failures (API down, rate limits)

Instead:
- ✅ Fast startup (<5 seconds to load tags)
- ✅ Offline-first (no internet needed)
- ✅ Reliable (tags bundled with extension)

## For Developers

### Initial Setup (One-Time)

Fetch BOJ problem tags and save them to the bundle:

```bash
cd packages/vscode-extension
npm run init-boj-tags
```

This will:
1. Fetch up to 5000 problems from solved.ac API
2. Generate `data/boj-problem-tags.json` (~420KB for 1000 problems, ~2MB for 5000)
3. Bundle the file with your extension

**Custom limit:**
```bash
npm run init-boj-tags 10000  # Fetch 10,000 problems
```

### When to Re-run

Re-run the fetch script to update tags:
- ✅ Before publishing a new extension version
- ✅ When new problems are added to solved.ac
- ✅ Monthly or quarterly to keep data fresh

**Recommended:** Schedule this as part of your release process.

### File Structure

```
packages/vscode-extension/
├── data/
│   └── boj-problem-tags.json      # Bundled tags (auto-generated)
├── scripts/
│   └── fetch-boj-tags.js          # Fetch script
└── src/
    └── services/
        └── IngestionService.ts    # Loads bundled tags
```

## For Users

### First Launch

On first launch, the extension will:
1. Detect empty database
2. Load tags from bundled JSON (~1-5 seconds)
3. Ingest into vector database
4. Show notification: "RAG system initialized with X BOJ problems!"

**No network calls. No waiting.**

### What's Included

Each problem includes:
- Problem ID & Korean title
- Difficulty level & name (Bronze 5, Silver 1, etc.)
- Algorithm tags (dp, graphs, bfs, etc.)
- Recommended approach (auto-generated from tags)

### Example Data

```json
{
  "problemId": 1149,
  "titleKo": "RGB거리",
  "difficulty": 10,
  "difficultyName": "Silver 1",
  "tags": ["dp"],
  "recommendedApproach": "Use dynamic programming with memoization..."
}
```

## Technical Details

### Data Format

**File:** `data/boj-problem-tags.json`

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-02-02T12:45:22.075Z",
  "problemCount": 1000,
  "problems": [
    {
      "problemId": 1000,
      "titleKo": "A+B",
      "difficulty": 1,
      "difficultyName": "Bronze 5",
      "tags": ["implementation", "arithmetic", "math"],
      "recommendedApproach": "..."
    }
  ]
}
```

### Ingestion Flow

```typescript
// On first launch
const tagsData = require('./data/boj-problem-tags.json');
await ingestionService.ingestFromBundledTags(extensionPath);
// Fast: processes 1000 problems in ~2-3 seconds
```

### Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Fetch tags (dev) | ~60s for 1000 | One-time during development |
| Load from JSON | <100ms | Fast file read |
| Ingest to DB | ~2-5s for 1000 | Vector embedding + DB insert |
| **Total first launch** | **<5s** | vs. 3-5 minutes with API fetch |

### File Sizes

| Problems | JSON Size | Compressed |
|----------|-----------|------------|
| 1,000 | ~420 KB | ~150 KB |
| 5,000 | ~2.1 MB | ~700 KB |
| 10,000 | ~4.2 MB | ~1.4 MB |

*Recommended: 5,000 problems (good balance)*

## Migration Notes

### Removed

- ❌ `anime-girlfriend.rag.autoInitializeTags` setting (no longer needed)
- ❌ `anime-girlfriend.rag.initialTagLimit` setting (no longer needed)
- ❌ Startup API calls to solved.ac
- ❌ `ingestProblemTags()` auto-run on startup

### Kept

- ✅ `anime-girlfriend.ingestProblemTags` command (manual refresh from API)
- ✅ All RAG functionality
- ✅ Database structure

### API Fetch Still Available

The live fetch command is still available for manual updates:

```
Ctrl+Shift+P → Anime Girlfriend: RAG: Fetch BOJ Problem Tags from solved.ac
```

Use this to:
- Supplement bundled tags with newer problems
- Manually refresh data between releases

## FAQ

**Q: Do I need to run init-boj-tags every time I develop?**
A: No! Only once initially, and then periodically to refresh data.

**Q: Can users fetch tags themselves?**
A: Yes, via the command palette, but it's optional. Bundled tags work offline.

**Q: What if the bundled data is outdated?**
A: Users can run the manual fetch command. Or you can re-release with fresh data.

**Q: Does this increase extension size?**
A: Yes, by ~2MB for 5000 problems. Worth it for the UX improvement.

**Q: What if data/boj-problem-tags.json is missing?**
A: Extension will show an error and prompt to run `npm run init-boj-tags`.

## Checklist for Publishing

Before publishing a new version:

- [ ] Run `npm run init-boj-tags` to refresh bundled data
- [ ] Verify `data/boj-problem-tags.json` exists
- [ ] Check file size is reasonable (<5MB)
- [ ] Test first-launch experience
- [ ] Update version number
- [ ] Build and package: `npm run package`

---

**Happy coding!** 🚀

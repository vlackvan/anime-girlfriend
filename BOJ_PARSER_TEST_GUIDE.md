# BOJ Problem Parser - Test Guide

## ✅ Implementation Complete

The BOJ problem parser has been successfully implemented in your VS Code extension.

## What Was Added

### 1. **BOJProblemParser Service**
- Location: `packages/vscode-extension/src/services/BOJProblemParser.ts`
- Features:
  - Fetches problem HTML from BOJ using `node-fetch`
  - Parses HTML using `cheerio` (lightweight DOM parser for Node.js)
  - Extracts: title, description, input/output specs, limits, sample test cases
  - Converts relative image URLs to absolute URLs
  - Formats output as markdown for display

### 2. **ChatPanel Integration**
- Added message handler: `fetchBOJProblem`
- Sends parsed data back to webview with `bojProblemFetched` message
- Error handling with `bojProblemError` message

### 3. **Test Command**
- Command: `Anime Girlfriend: Test BOJ Problem Parser`
- Accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P)

## How to Test

### Method 1: Using Command Palette (Recommended)

1. Press `F5` to launch the extension in debug mode (Extension Development Host)
2. In the new VS Code window, press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. Type: `Anime Girlfriend: Test BOJ Problem Parser`
4. Enter a BOJ problem number (e.g., `1000`, `1149`, `2580`)
5. A new markdown document will open showing the parsed problem

### Method 2: From Chat Interface (After Integration)

Once you integrate this with your chat UI:
1. User enters a problem number in the problem selector
2. Frontend sends: `{ type: 'fetchBOJProblem', problemId: '1000' }`
3. Extension parses the problem
4. Frontend receives: `{ type: 'bojProblemFetched', data: { ...problemData } }`

## Test Cases

### Easy Test
```
Problem: 1000 (A+B)
- Simple input/output
- Good for testing basic parsing
```

### Medium Test
```
Problem: 1149 (RGB거리)
- Has Korean text
- Dynamic programming problem
- Tests encoding handling
```

### Complex Test
```
Problem: 2580 (스도쿠)
- Has tables/complex formatting
- Tests HTML structure parsing
```

## Parsed Data Structure

```typescript
{
    problemId: string;           // "1000"
    title: string;              // "A+B"
    description: string;        // HTML content (images converted to absolute URLs)
    input: string;              // HTML content
    output: string;             // HTML content
    timeLimit?: string;         // "2 초"
    memoryLimit?: string;       // "128 MB"
    sampleInputs: string[];     // ["1 2"]
    sampleOutputs: string[];    // ["3"]
}
```

## Integration Points

### Frontend (React) Usage

```typescript
// Request parsing
window.vscode.postMessage({
    type: 'fetchBOJProblem',
    problemId: '1000'
});

// Handle response
useEffect(() => {
    const handler = (event: MessageEvent) => {
        const message = event.data;

        if (message.type === 'bojProblemFetched') {
            const problem = message.data;
            console.log('Problem:', problem.title);
            console.log('Description:', problem.description);
            // Display in UI...
        }

        if (message.type === 'bojProblemError') {
            console.error('Error:', message.error);
            // Show error to user...
        }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
}, []);
```

## Key Features

✅ **No Chrome Required** - Runs entirely in VS Code extension (Node.js)
✅ **No Browser Needed** - Direct HTTP requests to BOJ
✅ **Fast Parsing** - Cheerio is lightweight and fast
✅ **Image Support** - Converts relative image URLs to absolute
✅ **Sample Test Cases** - Extracts all sample inputs/outputs
✅ **Error Handling** - Graceful error messages for invalid problems
✅ **Korean Text Support** - Handles Korean characters correctly

## Verification Steps

To verify everything is working:

1. **Compile the extension**
   ```bash
   cd packages/vscode-extension
   npm run compile
   ```

2. **Launch Extension Development Host**
   - Press `F5` in VS Code
   - OR: Run > Start Debugging

3. **Test the command**
   - Open Command Palette
   - Run: `Anime Girlfriend: Test BOJ Problem Parser`
   - Enter problem number: `1000`
   - Should see markdown document with parsed problem

4. **Check console output**
   - View > Output
   - Select "Extension Host" from dropdown
   - Look for `[BOJProblemParser]` logs

## Next Steps

To integrate into your chat flow:

1. **Update ProblemSelector Component**
   - When user selects/enters problem, fetch problem data
   - Display problem statement in chat or dedicated view

2. **Add to Chat Context**
   - Send problem description to AI for context
   - AI can reference problem requirements when helping

3. **Cache Parsed Problems**
   - Store parsed problems to avoid re-fetching
   - Update cache when problem is re-selected

## Troubleshooting

### "Failed to fetch problem"
- Check internet connection
- Verify problem number exists on BOJ
- Check if BOJ website is accessible

### "Failed to extract problem description"
- BOJ might have changed their HTML structure
- Check if problem is a special type (contest-only, etc.)

### TypeScript errors
- Make sure cheerio types are installed: `npm install @types/cheerio --save-dev`
- Run `npm run compile` to rebuild

## Files Modified/Created

- ✅ `src/services/BOJProblemParser.ts` - New parser service
- ✅ `src/ChatPanel.ts` - Added message handler
- ✅ `src/extension.ts` - Added test command
- ✅ `package.json` - Added cheerio dependency and test command

All changes are backwards compatible and don't affect existing functionality!

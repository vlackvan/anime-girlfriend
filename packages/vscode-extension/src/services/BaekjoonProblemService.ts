/**
 * Service for fetching and parsing Baekjoon problem descriptions
 * Based on BaekjoonHub's parsing.js approach
 * Adapted for Node.js/VSCode Extension environment
 */

export interface BaekjoonProblemDescription {
    problemId: string;
    problemDescription: string;
    problemInput: string;
    problemOutput: string;
}

/**
 * Extract content from HTML element by ID using regex
 * (Node.js environment doesn't have DOM API)
 */
function extractElementContent(html: string, elementId: string): string {
    // Match the element with its ID
    const regex = new RegExp(`<div[^>]*id=["']${elementId}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
    const match = html.match(regex);
    
    if (!match || !match[1]) {
        return '';
    }

    let content = match[1].trim();
    
    // Convert image tags to absolute URLs
    content = convertImageTagAbsoluteURL(content);
    
    // Unescape HTML entities
    content = unescapeHtml(content);
    
    return content;
}

/**
 * Convert image tags to absolute URLs in HTML string
 */
function convertImageTagAbsoluteURL(html: string): string {
    // Match img tags with src attributes
    return html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
        if (src.startsWith('http')) {
            return match; // Already absolute
        }
        // Convert relative URL to absolute URL
        const absoluteSrc = src.startsWith('/')
            ? `https://www.acmicpc.net${src}`
            : `https://www.acmicpc.net/${src}`;
        return `<img${before}src="${absoluteSrc}"${after}>`;
    });
}

/**
 * Unescape HTML entities
 */
function unescapeHtml(html: string): string {
    return html
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

/**
 * Parse problem description from Baekjoon HTML
 */
function parseProblemDescription(html: string, problemId: string): BaekjoonProblemDescription | null {
    try {
        console.log(`[BaekjoonProblemService] Parsing HTML for problem ${problemId}...`);
        
        // Extract problem description
        const problemDescription = extractElementContent(html, 'problem_description');
        console.log(`[BaekjoonProblemService] Extracted problem_description: ${problemDescription.length} chars`);
        
        // Extract problem input
        const problemInput = extractElementContent(html, 'problem_input') || 'Empty';
        console.log(`[BaekjoonProblemService] Extracted problem_input: ${problemInput.length} chars`);
        
        // Extract problem output
        const problemOutput = extractElementContent(html, 'problem_output') || 'Empty';
        console.log(`[BaekjoonProblemService] Extracted problem_output: ${problemOutput.length} chars`);

        if (!problemDescription) {
            console.error(`[BaekjoonProblemService] ❌ Problem description is empty for problem ${problemId}`);
            return null;
        }

        console.log(`[BaekjoonProblemService] ✅ Successfully parsed all components for problem ${problemId}`);
        return {
            problemId,
            problemDescription,
            problemInput,
            problemOutput
        };
    } catch (error) {
        console.error('[BaekjoonProblemService] ❌ Failed to parse problem description:', error);
        return null;
    }
}

/**
 * Fetch problem description from Baekjoon
 */
export async function fetchProblemDescription(problemId: string): Promise<BaekjoonProblemDescription | null> {
    try {
        console.log(`[BaekjoonProblemService] Fetching problem ${problemId}...`);
        
        const response = await fetch(`https://www.acmicpc.net/problem/${problemId}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            console.error(`[BaekjoonProblemService] HTTP Error: ${response.status}`);
            return null;
        }

        const html = await response.text();
        console.log(`[BaekjoonProblemService] HTML received, length: ${html.length} chars`);
        
        const parsed = parseProblemDescription(html, problemId);

        if (parsed) {
            console.log(`[BaekjoonProblemService] ✅ Successfully parsed problem ${problemId}`);
            console.log(`[BaekjoonProblemService] 📊 Parsed Data Summary:`);
            console.log(`[BaekjoonProblemService]   - Problem Description: ${parsed.problemDescription.length} chars`);
            console.log(`[BaekjoonProblemService]   - Problem Input: ${parsed.problemInput.length} chars`);
            console.log(`[BaekjoonProblemService]   - Problem Output: ${parsed.problemOutput.length} chars`);
            console.log(`[BaekjoonProblemService] 📝 Problem Description (first 300 chars):`);
            console.log(`[BaekjoonProblemService] ${parsed.problemDescription.substring(0, 300)}${parsed.problemDescription.length > 300 ? '...' : ''}`);
            console.log(`[BaekjoonProblemService] 📥 Problem Input (first 200 chars):`);
            console.log(`[BaekjoonProblemService] ${parsed.problemInput.substring(0, 200)}${parsed.problemInput.length > 200 ? '...' : ''}`);
            console.log(`[BaekjoonProblemService] 📤 Problem Output (first 200 chars):`);
            console.log(`[BaekjoonProblemService] ${parsed.problemOutput.substring(0, 200)}${parsed.problemOutput.length > 200 ? '...' : ''}`);
        } else {
            console.error(`[BaekjoonProblemService] ❌ Failed to parse problem ${problemId}`);
            console.error(`[BaekjoonProblemService] HTML contains 'problem_description': ${html.includes('problem_description')}`);
            console.error(`[BaekjoonProblemService] HTML contains 'problem_input': ${html.includes('problem_input')}`);
            console.error(`[BaekjoonProblemService] HTML contains 'problem_output': ${html.includes('problem_output')}`);
        }

        return parsed;
    } catch (error) {
        console.error(`[BaekjoonProblemService] Error fetching problem ${problemId}:`, error);
        return null;
    }
}

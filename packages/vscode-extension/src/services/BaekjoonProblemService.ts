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
        // Extract problem description
        const problemDescription = extractElementContent(html, 'problem_description');
        
        // Extract problem input
        const problemInput = extractElementContent(html, 'problem_input') || 'Empty';
        
        // Extract problem output
        const problemOutput = extractElementContent(html, 'problem_output') || 'Empty';

        if (!problemDescription) {
            return null;
        }

        return {
            problemId,
            problemDescription,
            problemInput,
            problemOutput
        };
    } catch (error) {
        console.error('[BaekjoonProblemService] Failed to parse problem description:', error);
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
        const parsed = parseProblemDescription(html, problemId);

        if (parsed) {
            console.log(`[BaekjoonProblemService] Successfully parsed problem ${problemId}`);
        } else {
            console.error(`[BaekjoonProblemService] Failed to parse problem ${problemId}`);
        }

        return parsed;
    } catch (error) {
        console.error(`[BaekjoonProblemService] Error fetching problem ${problemId}:`, error);
        return null;
    }
}

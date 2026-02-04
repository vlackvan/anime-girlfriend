import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export interface BOJProblemData {
    problemId: string;
    title: string;
    description: string;
    input: string;
    output: string;
    timeLimit?: string;
    memoryLimit?: string;
    sampleInputs: string[];
    sampleOutputs: string[];
}

export class BOJProblemParser {
    private static BASE_URL = 'https://www.acmicpc.net/problem';

    /**
     * Fetch and parse a BOJ problem by ID
     * @param problemId - The BOJ problem number (e.g., "1000")
     * @returns Structured problem data
     */
    async fetchProblem(problemId: string): Promise<BOJProblemData> {
        const url = `${BOJProblemParser.BASE_URL}/${problemId}`;
        console.log(`[BOJProblemParser] Fetching problem from: ${url}`);

        try {
            // 1. Fetch HTML with browser-like headers to avoid 403 Forbidden
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch problem ${problemId}: ${response.status} ${response.statusText}`);
            }
            const html = await response.text();

            // 2. Parse with cheerio
            const $ = cheerio.load(html);

            // Check if problem exists (check for error message)
            const errorMessage = $('.alert-danger').text().trim();
            if (errorMessage) {
                throw new Error(`Problem ${problemId} not found or is not accessible`);
            }

            // 3. Extract title from page title
            const pageTitle = $('title').text();
            const titleMatch = pageTitle.match(/^\d+:\s*(.+)/);
            const title = titleMatch ? titleMatch[1].trim() : `Problem ${problemId}`;

            // 4. Extract main problem sections (same IDs as Chrome extension)
            const problemDescription = $('#problem_description').html()?.trim() || '';
            const problemInput = $('#problem_input').html()?.trim() || 'Empty';
            const problemOutput = $('#problem_output').html()?.trim() || 'Empty';

            if (!problemDescription) {
                throw new Error(`Failed to extract problem description for ${problemId}`);
            }

            // 5. Extract limits from problem info table
            const timeLimit = $('#problem-info tbody tr')
                .filter((_, elem) => $(elem).find('th').text().includes('시간 제한'))
                .find('td')
                .text()
                .trim();

            const memoryLimit = $('#problem-info tbody tr')
                .filter((_, elem) => $(elem).find('th').text().includes('메모리 제한'))
                .find('td')
                .text()
                .trim();

            // 6. Extract sample test cases
            const sampleInputs: string[] = [];
            const sampleOutputs: string[] = [];

            $('pre[id^="sample-input-"]').each((_, elem) => {
                sampleInputs.push($(elem).text().trim());
            });

            $('pre[id^="sample-output-"]').each((_, elem) => {
                sampleOutputs.push($(elem).text().trim());
            });

            // 7. Convert relative image URLs to absolute
            const descriptionWithAbsoluteUrls = this.convertImageUrls(problemDescription);
            const inputWithAbsoluteUrls = this.convertImageUrls(problemInput);
            const outputWithAbsoluteUrls = this.convertImageUrls(problemOutput);

            console.log(`[BOJProblemParser] Successfully parsed problem ${problemId}: ${title}`);
            console.log(`[BOJProblemParser] Found ${sampleInputs.length} sample test cases`);

            return {
                problemId,
                title,
                description: descriptionWithAbsoluteUrls,
                input: inputWithAbsoluteUrls,
                output: outputWithAbsoluteUrls,
                timeLimit: timeLimit || undefined,
                memoryLimit: memoryLimit || undefined,
                sampleInputs,
                sampleOutputs
            };
        } catch (error) {
            console.error(`[BOJProblemParser] Error fetching problem ${problemId}:`, error);
            throw error;
        }
    }

    /**
     * Convert relative image URLs to absolute URLs
     * This ensures images render correctly when displayed in VS Code
     */
    private convertImageUrls(html: string): string {
        // Convert relative URLs like /judge/img/... to absolute
        return html.replace(
            /<img([^>]+)src="([^"]+)"/g,
            (match, attrs, src) => {
                if (src.startsWith('/')) {
                    return `<img${attrs}src="https://www.acmicpc.net${src}"`;
                } else if (!src.startsWith('http')) {
                    // Handle protocol-relative URLs or other edge cases
                    return `<img${attrs}src="https://www.acmicpc.net/${src}"`;
                }
                return match;
            }
        );
    }

    /**
     * Format problem data as markdown for display
     */
    formatAsMarkdown(problem: BOJProblemData): string {
        let markdown = `# ${problem.problemId}: ${problem.title}\n\n`;

        if (problem.timeLimit || problem.memoryLimit) {
            markdown += `**제한**: `;
            if (problem.timeLimit) {
                markdown += `시간 ${problem.timeLimit}`;
            }
            if (problem.memoryLimit) {
                if (problem.timeLimit) markdown += ' / ';
                markdown += `메모리 ${problem.memoryLimit}`;
            }
            markdown += '\n\n';
        }

        markdown += `## 문제\n${this.htmlToMarkdown(problem.description)}\n\n`;
        markdown += `## 입력\n${this.htmlToMarkdown(problem.input)}\n\n`;
        markdown += `## 출력\n${this.htmlToMarkdown(problem.output)}\n\n`;

        if (problem.sampleInputs.length > 0) {
            markdown += `## 예제\n\n`;
            problem.sampleInputs.forEach((input, idx) => {
                markdown += `### 예제 입력 ${idx + 1}\n\`\`\`\n${input}\n\`\`\`\n\n`;
                if (problem.sampleOutputs[idx]) {
                    markdown += `### 예제 출력 ${idx + 1}\n\`\`\`\n${problem.sampleOutputs[idx]}\n\`\`\`\n\n`;
                }
            });
        }

        return markdown;
    }

    /**
     * Simple HTML to markdown conversion (basic)
     */
    private htmlToMarkdown(html: string): string {
        // Strip HTML tags but preserve basic structure
        return html
            .replace(/<p>/g, '\n')
            .replace(/<\/p>/g, '\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<strong>|<b>/g, '**')
            .replace(/<\/strong>|<\/b>/g, '**')
            .replace(/<em>|<i>/g, '_')
            .replace(/<\/em>|<\/i>/g, '_')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
    }
}

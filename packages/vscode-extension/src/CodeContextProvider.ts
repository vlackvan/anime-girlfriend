import * as vscode from 'vscode';

export interface CodeContext {
    fileName: string;
    filePath: string;
    languageId: string;
    content: string;
    selectedText?: string;
    diagnostics: DiagnosticInfo[];
}

export interface DiagnosticInfo {
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    line: number;
    column: number;
}

export type CodingState = 'NOT_STARTED' | 'WRITING' | 'HAS_ERROR' | 'SOLVED';

export interface CodingStateInfo {
    state: CodingState;
    codeLength: number;
    hasErrors: boolean;
    hasWarnings: boolean;
}

export class CodeContextProvider {
    /**
     * Get the current coding state based on code length and diagnostics
     */
    getCodingState(): CodingStateInfo {
        const context = this.getActiveContext();

        if (!context) {
            return { state: 'NOT_STARTED', codeLength: 0, hasErrors: false, hasWarnings: false };
        }

        const codeLength = context.content.trim().length;
        const hasErrors = context.diagnostics.some(d => d.severity === 'error');
        const hasWarnings = context.diagnostics.some(d => d.severity === 'warning');

        if (codeLength === 0) {
            return { state: 'NOT_STARTED', codeLength, hasErrors, hasWarnings };
        }

        if (hasErrors) {
            return { state: 'HAS_ERROR', codeLength, hasErrors, hasWarnings };
        }

        return { state: 'WRITING', codeLength, hasErrors, hasWarnings };
    }

    /**
     * Get the current code context from the active editor
     */
    getActiveContext(): CodeContext | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const document = editor.document;
        const selection = editor.selection;

        // Get diagnostics for this file
        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const diagnosticInfos: DiagnosticInfo[] = diagnostics.map(d => ({
            severity: this.getSeverityString(d.severity),
            message: d.message,
            line: d.range.start.line + 1, // 1-indexed
            column: d.range.start.character + 1
        }));

        // Get content (limit to ~2000 lines to avoid token explosion)
        const maxLines = 2000;
        const lines = document.getText().split('\n');
        const content = lines.slice(0, maxLines).join('\n');
        const truncated = lines.length > maxLines;

        return {
            fileName: document.fileName.split(/[/\\]/).pop() || 'unknown',
            filePath: document.fileName,
            languageId: document.languageId,
            content: truncated ? content + '\n// ... (truncated)' : content,
            selectedText: selection.isEmpty ? undefined : document.getText(selection),
            diagnostics: diagnosticInfos
        };
    }

    /**
     * Build a formatted context string for the AI prompt
     */
    buildContextString(): string {
        const context = this.getActiveContext();

        if (!context) {
            return 'No active code file.';
        }

        let result = `## Currently Editing\n`;
        result += `**File:** ${context.fileName}\n`;
        result += `**Language:** ${context.languageId}\n\n`;

        // Add errors/warnings if present
        if (context.diagnostics.length > 0) {
            result += `### Diagnostics\n`;
            context.diagnostics.slice(0, 10).forEach(d => {
                result += `- Line ${d.line}: [${d.severity.toUpperCase()}] ${d.message}\n`;
            });
            if (context.diagnostics.length > 10) {
                result += `- ... and ${context.diagnostics.length - 10} more\n`;
            }
            result += '\n';
        }

        // Add selected text if present
        if (context.selectedText) {
            result += `### Selected Code\n\`\`\`${context.languageId}\n${context.selectedText}\n\`\`\`\n\n`;
        }

        // Add full code (truncated)
        const codeLines = context.content.split('\n');
        const showLines = Math.min(codeLines.length, 100); // Limit for prompt
        result += `### Code (first ${showLines} lines)\n\`\`\`${context.languageId}\n`;
        result += codeLines.slice(0, showLines).join('\n');
        if (codeLines.length > showLines) {
            result += `\n// ... (${codeLines.length - showLines} more lines)`;
        }
        result += '\n```\n';

        return result;
    }

    private getSeverityString(severity: vscode.DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return 'error';
            case vscode.DiagnosticSeverity.Warning: return 'warning';
            case vscode.DiagnosticSeverity.Information: return 'info';
            case vscode.DiagnosticSeverity.Hint: return 'hint';
            default: return 'info';
        }
    }
}

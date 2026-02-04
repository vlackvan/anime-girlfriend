import * as http from 'http';
import { CharacterId, getAvailableCharacters } from './characters';

export interface BOJJudgeResult {
    problemId: string;
    resultText: string;
    status: 'accepted' | 'wrong_answer' | 'time_limit' | 'memory_limit' | 
            'runtime_error' | 'compile_error' | 'output_limit' | 
            'presentation_error' | 'unknown';
    memory?: string;
    time?: string;
    submissionId?: string;
    timestamp?: string;
}

type BOJCallback = (data: BOJJudgeResult) => void;
type GetCharacterCallback = () => CharacterId | undefined;

export class LocalServer {
    private server: http.Server;
    private port: number;
    private getCharacter: GetCharacterCallback;

    constructor(port: number, onBOJSuccess: BOJCallback, getCharacter: GetCharacterCallback) {
        this.port = port;
        this.getCharacter = getCharacter;

        this.server = http.createServer((req, res) => {
            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.method === 'POST' && (req.url === '/judge-result' || req.url === '/success')) {
                let body = '';

                req.on('data', (chunk) => {
                    body += chunk.toString();
                });

                req.on('end', () => {
                    try {
                        const data: BOJJudgeResult = JSON.parse(body);
                        console.log('[LocalServer] Received BOJ judge result:', data);

                        onBOJSuccess(data);

                        const selectedCharacter = this.getCharacter();
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'Received!',
                            character: selectedCharacter || getAvailableCharacters()[0] // Default to first character if no character selected
                        }));
                    } catch (error) {
                        console.error('[LocalServer] Parse error:', error);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
                    }
                });
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        this.server.listen(this.port, () => {
            console.log(`[LocalServer] Listening on port ${this.port}`);
        });

        this.server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[LocalServer] Port ${this.port} is already in use`);
            } else {
                console.error('[LocalServer] Server error:', err);
            }
        });
    }

    stop() {
        this.server.close();
        console.log('[LocalServer] Server stopped');
    }
}

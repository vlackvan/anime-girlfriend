import * as http from 'http';

interface BOJSuccessData {
    problemId: string;
    status: string;
    timestamp?: string;
}

type BOJCallback = (data: BOJSuccessData) => void;

export class LocalServer {
    private server: http.Server;
    private port: number;

    constructor(port: number, onBOJSuccess: BOJCallback) {
        this.port = port;

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

            if (req.method === 'POST' && req.url === '/success') {
                let body = '';

                req.on('data', (chunk) => {
                    body += chunk.toString();
                });

                req.on('end', () => {
                    try {
                        const data: BOJSuccessData = JSON.parse(body);
                        console.log('[LocalServer] Received BOJ success:', data);

                        onBOJSuccess(data);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Received!' }));
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

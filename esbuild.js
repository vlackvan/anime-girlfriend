const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Extension build
const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
    minify: false,
};

// Webview build
const webviewConfig = {
    entryPoints: ['src/webview/webview.tsx'],
    bundle: true,
    outfile: 'out/webview.js',
    format: 'iife',
    platform: 'browser',
    sourcemap: true,
    minify: false,
    define: {
        'process.env.NODE_ENV': '"development"'
    },
};

async function build() {
    try {
        if (isWatch) {
            const extCtx = await esbuild.context(extensionConfig);
            const webCtx = await esbuild.context(webviewConfig);
            await Promise.all([extCtx.watch(), webCtx.watch()]);
            console.log('Watching for changes...');
        } else {
            await esbuild.build(extensionConfig);
            await esbuild.build(webviewConfig);
            console.log('Build complete!');
        }
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

build();

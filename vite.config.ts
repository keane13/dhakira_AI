import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Serves /api/explain during local development with the same handler Netlify runs. */
function devApi(): Plugin {
  return {
    name: 'dhakira-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/explain', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'POST only.' });
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', async () => {
          try {
            const mod = await server.ssrLoadModule('/server/explain.ts');
            const out = await mod.explain(JSON.parse(raw));
            send(out.status, out.body);
          } catch (err) {
            send(500, { error: err instanceof Error ? err.message : 'Server error' });
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'CLAUDE_']));
  // In server mode (vite --mode server), the FastAPI routes go to the local backend.
  // /api/explain stays on the Node handler above.
  const backend = process.env.DHAKIRA_API_TARGET ?? 'http://127.0.0.1:8000';
  const proxied = ['/api/auth', '/api/records', '/api/cases', '/api/audit', '/api/health'];
  return {
    plugins: [react(), devApi()],
    server: { proxy: Object.fromEntries(proxied.map((p) => [p, { target: backend, changeOrigin: false }])) },
    test: { include: ['tests/**/*.test.ts'] },
  };
});

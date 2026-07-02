import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { DaemonClient, readToken } from './daemon-client.js';
import { AppStore } from './store.js';
import { registerRoutes } from './routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CG_HOME = join(homedir(), '.commandgarden');
const CONFIG_PATH = join(CG_HOME, 'config.yaml');
const TOKEN_PATH = join(CG_HOME, 'session-token');

function readAppPort(): number {
  try {
    if (existsSync(CONFIG_PATH)) {
      const config = parseYaml(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, Record<string, unknown>>;
      const port = config?.app?.port;
      if (typeof port === 'number') return port;
    }
  } catch { /* use default */ }
  return 19826;
}

async function start() {
  const token = readToken(TOKEN_PATH);
  if (!token) {
    console.error('No session token found. Is the daemon running?');
    process.exit(1);
  }

  const port = readAppPort();
  const daemonUrl = 'http://127.0.0.1:19825';
  const daemon = new DaemonClient(daemonUrl, token);
  const store = await AppStore.create(join(CG_HOME, 'app.db'));
  const app = Fastify();

  registerRoutes(app, daemon, store);

  // Serve static SPA files in production
  const clientDir = join(__dirname, '..', 'client');
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, {
      root: clientDir,
      wildcard: false,
    });
    // SPA fallback: serve index.html for all non-API routes
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ ok: false, error: 'Not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  await app.listen({ port, host: '127.0.0.1' });
  console.log(`commandGarden GUI running at http://127.0.0.1:${port}`);
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

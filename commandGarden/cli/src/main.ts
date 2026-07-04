// src/main.ts
import { Command } from 'commander';
import { join, dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DaemonClient, readToken } from '@commandgarden/shared';
import { resolveScript } from './resolve-script.js';
import { parseDuration } from './duration.js';
import type { OutputFormat } from './formatters.js';
import { executeRun, parseConnectorArgs } from './commands/run.js';
import { executeList } from './commands/list.js';
import { executeInspect } from './commands/inspect.js';
import { executeValidate } from './commands/validate.js';
import { executeDaemonStatus, executeDaemonStart, executeDaemonStop } from './commands/daemon-cmd.js';
import { executeAuditList, executeAuditExport, executeAuditShow } from './commands/audit.js';
import { executeConfigShow, executeConfigSet } from './commands/config-cmd.js';
import { executeGuiStart, executeGuiStop, executeGuiStatus } from './commands/gui-cmd.js';
import { executeUp, executeDown } from './commands/up-down.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

let _daemonScript: string | undefined;
function getDaemonScript(): string {
  return (_daemonScript ??= resolveScript(__dirname, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js'));
}

let _appScript: string | undefined;
function getAppScript(): string {
  return (_appScript ??= resolveScript(__dirname, '../../app/dist/server/main.js', '@commandgarden/app', 'dist/server/main.js'));
}

const CG_HOME = join(homedir(), '.commandgarden');
const TOKEN_PATH = join(CG_HOME, 'session-token');
const CONFIG_PATH = join(CG_HOME, 'config.yaml');
const BASE_URL = `http://127.0.0.1:9091`;

function createClient(): DaemonClient {
  const token = readToken(TOKEN_PATH);
  if (!token) {
    console.error('No session token found. Is the daemon running? Try: cg daemon start');
    process.exit(1);
  }
  return new DaemonClient(BASE_URL, token);
}

const program = new Command();
program
  .name('commandgarden')
  .version(CLI_VERSION)
  .description('Enterprise browser automation CLI');

// --- run ---
program
  .command('run <connector>')
  .description('Run a connector command')
  .option('-f, --format <format>', 'output format: table, json, csv', 'table')
  .allowUnknownOption()
  .action(async (connector: string, opts: { format: string }, cmd: Command) => {
    const client = createClient();
    const connectorArgs = parseConnectorArgs(cmd.args);
    const output = await executeRun(client, connector, connectorArgs, opts.format as OutputFormat);
    console.log(output);
  });

// --- list ---
program
  .command('list')
  .description('List all installed connectors')
  .action(async () => {
    const client = createClient();
    console.log(await executeList(client));
  });

// --- inspect ---
program
  .command('inspect <connector>')
  .description('Show full details of a connector')
  .action(async (connector: string) => {
    const client = createClient();
    console.log(await executeInspect(client, connector));
  });

// --- validate ---
program
  .command('validate <file>')
  .description('Validate a connector YAML file')
  .action((file: string) => {
    console.log(executeValidate(file));
  });

// --- daemon ---
const daemon = program
  .command('daemon')
  .description('Manage the daemon process');

daemon
  .command('status')
  .description('Check daemon status')
  .action(async () => {
    console.log(await executeDaemonStatus(BASE_URL));
  });

daemon
  .command('start')
  .description('Start the daemon in background')
  .action(async () => {
    const result = await executeDaemonStart(BASE_URL, CG_HOME, getDaemonScript());
    console.log(result.message);
  });

daemon
  .command('stop')
  .description('Stop the daemon')
  .action(async () => {
    console.log(await executeDaemonStop(CG_HOME));
  });

// --- audit ---
const audit = program
  .command('audit')
  .description('View audit event log');

audit
  .command('list')
  .description('List recent audit events')
  .option('--since <duration>', 'time window, e.g. 7d, 2w, 12h')
  .option('--connector <pattern>', 'filter by connector pattern, e.g. test/*')
  .option('--type <pattern>', 'filter by event type, e.g. auth.failed, command.*')
  .option('--limit <n>', 'max events to return', '100')
  .action(async (opts: { since?: string; connector?: string; type?: string; limit: string }) => {
    const client = createClient();
    const filter: { since?: string; connector?: string; type?: string; limit?: number } = {};
    if (opts.since) filter.since = parseDuration(opts.since).toISOString();
    if (opts.connector) filter.connector = opts.connector;
    if (opts.type) filter.type = opts.type;
    filter.limit = parseInt(opts.limit, 10);
    console.log(await executeAuditList(client, filter));
  });

audit
  .command('export')
  .description('Export audit events')
  .option('--format <format>', 'export format: json, csv', 'json')
  .option('--since <duration>', 'time window, e.g. 7d, 30d')
  .option('--connector <pattern>', 'filter by connector pattern')
  .option('--type <pattern>', 'filter by event type')
  .action(async (opts: { format: string; since?: string; connector?: string; type?: string }) => {
    const client = createClient();
    const filter: { since?: string; connector?: string; type?: string } = {};
    if (opts.since) filter.since = parseDuration(opts.since).toISOString();
    if (opts.connector) filter.connector = opts.connector;
    if (opts.type) filter.type = opts.type;
    console.log(await executeAuditExport(client, filter, opts.format as 'json' | 'csv'));
  });

audit
  .command('show <id>')
  .description('Show full details of an audit event')
  .action(async (id: string) => {
    const client = createClient();
    console.log(await executeAuditShow(client, id));
  });

// --- config ---
const config = program
  .command('config')
  .description('Manage daemon configuration');

config
  .command('show')
  .description('Show current configuration')
  .action(() => {
    console.log(executeConfigShow(CONFIG_PATH));
  });

config
  .command('set <key> <value>')
  .description('Set a configuration value (e.g. daemon.port 9999)')
  .action(async (key: string, value: string) => {
    const client = createClient();
    console.log(await executeConfigSet(client, key, value));
  });

// --- gui ---
const gui = program
  .command('gui')
  .description('Manage the GUI app server');

gui
  .command('start', { isDefault: true })
  .description('Start the GUI (foreground by default)')
  .option('-b, --background', 'Run in background')
  .option('--no-open', 'Do not open browser')
  .action(async (opts: { background?: boolean; open?: boolean }) => {
    const result = await executeGuiStart(BASE_URL, CG_HOME, getAppScript(), {
      background: opts.background,
      noOpen: opts.open === false,
      configPath: CONFIG_PATH,
    });
    console.log(typeof result === 'string' ? result : result.message);
  });

gui
  .command('stop')
  .description('Stop the GUI')
  .action(() => { console.log(executeGuiStop(CG_HOME)); });

gui
  .command('status')
  .description('Check GUI status')
  .action(() => { console.log(executeGuiStatus(CG_HOME)); });

// --- up/down ---
program
  .command('up')
  .description('Start daemon + GUI, open browser (use --no-open to skip)')
  .option('--no-open', 'Do not open browser')
  .action(async (opts: { open?: boolean }) => {
    console.log(await executeUp(BASE_URL, CG_HOME, getDaemonScript(), getAppScript(), CONFIG_PATH, {
      noOpen: opts.open === false,
    }));
  });

program
  .command('down')
  .description('Stop GUI + daemon')
  .action(async () => {
    console.log(await executeDown(CG_HOME));
  });

program.parse();

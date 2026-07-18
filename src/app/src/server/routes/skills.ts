import type { FastifyInstance } from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SkillFile {
  name: string;
  content: string;
}

interface Skill {
  name: string;
  description: string;
  files: SkillFile[];
}

function findSkillsDir(): string | null {
  const candidates = [
    // From app/{dist,src}/server/routes/ → app/skills/ (bundled via prepare-bundle)
    join(__dirname, '..', '..', '..', 'skills'),
    // From app/{dist,src}/server/routes/ → monorepo root skills/ (local dev)
    join(__dirname, '..', '..', '..', '..', '..', 'skills'),
  ];
  for (const p of candidates) {
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

function parseFrontmatter(content: string): { description: string; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { description: '', body: content };
  const frontmatter = match[1];
  const body = match[2];
  const descMatch = frontmatter.match(/description:\s*"(.+?)"/);
  return { description: descMatch?.[1] ?? '', body };
}

function loadSkills(dir: string): Skill[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(dir, entry.name);
    const skillMd = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;

    const skillContent = readFileSync(skillMd, 'utf-8');
    const { description } = parseFrontmatter(skillContent);

    const files: SkillFile[] = [];
    for (const f of readdirSync(skillDir)) {
      const fp = join(skillDir, f);
      if (statSync(fp).isFile() && f.endsWith('.md')) {
        files.push({ name: f, content: readFileSync(fp, 'utf-8') });
      }
    }

    skills.push({ name: entry.name, description, files });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function skillsRoutes(app: FastifyInstance): void {
  app.get('/api/skills', async (_req, reply) => {
    const dir = findSkillsDir();
    if (!dir) {
      reply.code(404).send({ ok: false, error: 'Skills directory not found' });
      return;
    }
    try {
      const skills = loadSkills(dir);
      return { ok: true, skills };
    } catch (err) {
      reply.code(500).send({ ok: false, error: err instanceof Error ? err.message : 'Failed to load skills' });
    }
  });
}

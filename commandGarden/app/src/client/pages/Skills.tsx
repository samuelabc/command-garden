import { useEffect, useMemo, useState } from 'react';
import { api, type Skill, type SkillFile } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

function parseMarkdownSections(content: string): { heading: string; body: string }[] {
  // Strip frontmatter
  const stripped = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  const lines = stripped.split('\n');
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join('\n').trim() });
      current = { heading: headingMatch[2], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Content before first heading — treat as intro
      if (line.trim()) {
        if (!current) current = { heading: '', lines: [] };
        current.lines.push(line);
      }
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join('\n').trim() });
  return sections;
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <pre className="text-sm font-mono whitespace-pre-wrap opacity-70 leading-relaxed overflow-x-auto">
      {content}
    </pre>
  );
}

function SkillFileView({ file, defaultOpen }: { file: SkillFile; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const sections = useMemo(() => parseMarkdownSections(file.content), [file.content]);

  return (
    <div className="border border-base-300/50">
      <button
        className="flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-base-200/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-xs opacity-50">{open ? '▾' : '▸'}</span>
        <span className="font-mono text-sm font-semibold">{file.name}</span>
        <span className="text-xs opacity-40">{sections.length} {sections.length === 1 ? 'section' : 'sections'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <h5 className="font-mono text-xs font-semibold uppercase tracking-[0.08em] opacity-50 mb-2">{s.heading}</h5>
              )}
              <MarkdownBlock content={s.body} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);
  const mainFile = skill.files.find(f => f.name === 'SKILL.md');
  const extraFiles = skill.files.filter(f => f.name !== 'SKILL.md');

  return (
    <div className="border border-base-300">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-base font-semibold">{skill.name}</span>
              <Badge size="xs">{skill.files.length} {skill.files.length === 1 ? 'file' : 'files'}</Badge>
            </div>
            <p className="text-sm opacity-60 mt-1.5 max-w-prose">{skill.description}</p>
          </div>
          <button
            className="btn btn-sm btn-ghost font-mono text-xs shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Collapse' : 'View'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-base-300 p-4 space-y-3">
          {mainFile && <SkillFileView file={mainFile} defaultOpen />}
          {extraFiles.map(f => (
            <SkillFileView key={f.name} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSkills()
      .then(res => setSkills(res.skills))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load skills'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading skills..." />;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-1">Skills</h2>
      <p className="text-sm opacity-60 mb-5">AI agent skills bundled with commandGarden. These teach coding assistants how to use cg and author connectors.</p>

      {error ? (
        <div className="border border-error/30 p-4">
          <p className="text-sm text-error font-semibold mb-1">Failed to load skills</p>
          <p className="font-mono text-xs opacity-60">{error}</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No skills found</p>
          <p className="font-mono text-xs opacity-30">Skills should be located in the skills/ directory of the commandGarden package.</p>
        </div>
      ) : (
        <>
          {/* Summary table */}
          <div className="overflow-x-auto border border-base-300 mb-6">
            <table className="table table-sm w-full">
              <thead>
                <tr className="bg-base-200">
                  <th>Skill</th>
                  <th>Description</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                {skills.map(s => (
                  <tr key={s.name} className="hover:bg-base-200">
                    <td className="font-mono text-sm font-semibold whitespace-nowrap">{s.name}</td>
                    <td className="text-sm opacity-60">{s.description}</td>
                    <td className="text-center">
                      <Badge size="xs">{s.files.length}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Skill detail cards */}
          <h3 className="font-display text-base font-semibold mb-3">Skill Details</h3>
          <div className="space-y-3">
            {skills.map(s => (
              <SkillCard key={s.name} skill={s} />
            ))}
          </div>

          {/* Installation hint */}
          <div className="border border-base-300 p-4 mt-6">
            <h4 className="font-mono text-xs font-semibold uppercase tracking-[0.08em] opacity-50 mb-2">Usage</h4>
            <p className="text-sm opacity-60 mb-2">
              Copy a skill's <code className="font-mono text-xs bg-base-200 px-1 py-0.5">SKILL.md</code> into your AI assistant's skill directory to teach it how to use commandGarden.
            </p>
            <div className="font-mono text-xs opacity-40">
              <span>Windsurf: </span>
              <code className="bg-base-200 px-1 py-0.5">.windsurf/skills/</code>
              <span className="mx-2">|</span>
              <span>Claude: </span>
              <code className="bg-base-200 px-1 py-0.5">.claude/skills/</code>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

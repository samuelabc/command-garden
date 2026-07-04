'use client';
import type { JournalResponse } from '@/lib/types';

interface Props {
  data: JournalResponse;
}

export function SummaryCards({ data }: Props) {
  const { timetracking, meetings, jira, git } = data;

  const cards = [
    {
      label: 'Hours Logged',
      value: timetracking ? `${timetracking.totalHours}h` : '—',
      sub: timetracking ? `/ ${timetracking.targetHours}h target` : '',
      color: timetracking && timetracking.totalHours < timetracking.targetHours * 0.8 ? 'text-warning' : 'text-success',
    },
    {
      label: 'Meetings',
      value: meetings ? String(meetings.totalCount) : '—',
      sub: meetings ? `${meetings.totalHours}h total` : '',
      color: meetings && meetings.totalHours > 20 ? 'text-warning' : 'text-info',
    },
    {
      label: 'Tickets Done',
      value: jira ? String(jira.resolved.length) : '—',
      sub: jira ? `${jira.inProgress.length} in progress` : '',
      color: 'text-accent',
    },
    {
      label: 'Commits',
      value: git ? String(git.totalCommits) : '—',
      sub: git ? `${git.totalPRsMerged} PRs merged` : '',
      color: 'text-primary',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="stat bg-base-200 rounded-box p-4">
          <div className="stat-title text-xs">{card.label}</div>
          <div className={`stat-value text-2xl ${card.color}`}>{card.value}</div>
          <div className="stat-desc">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

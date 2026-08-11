import { useState } from 'react';

import { assigneeLabel, type MonthlyReport, UNASSIGNED } from '@/lib/report';

const FALLBACK_COLOR = '#475569';

const FALLBACK_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#0891b2',
  '#16a34a',
  '#ca8a04',
];

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  const letters = words.map((word) => word.charAt(0)).join('');
  return letters.toUpperCase() || '?';
}

function colorOf(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 1_000_003;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? FALLBACK_COLOR;
}

export function Avatar({
  report,
  assignee,
  size = 18,
}: {
  report: MonthlyReport;
  assignee: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const name = assigneeLabel(report, assignee);
  const url = report.assignee_avatars[assignee];
  const unassigned = assignee === UNASSIGNED;

  const shared = {
    className: 'flex-none rounded-full',
    style: { width: size, height: size },
    title: name,
  };

  if (url && !failed && !unassigned) {
    return <img {...shared} src={url} alt="" onError={() => setFailed(true)} />;
  }

  return (
    <span
      {...shared}
      className={`${shared.className} inline-flex items-center justify-center font-semibold text-white`}
      style={{
        ...shared.style,
        background: unassigned ? '#cbd5e1' : colorOf(assignee),
        fontSize: Math.round(size * 0.45),
      }}
      aria-hidden="true"
    >
      {unassigned ? '·' : initialsOf(name)}
    </span>
  );
}

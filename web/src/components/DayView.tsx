import { categoryLabel, formatDuration, type MonthlyReport } from '@/lib/report';

interface Block {
  issueKey: string;
  summary: string | null;
  statusName: string;
  category: string;
  from: number;
  to: number;
  open: boolean;
  isSegmentEnd: boolean;
  lane: number;
  lanes: number;
}

function hourFraction(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return read('hour') + read('minute') / 60;
}

const BREAK_PCT = 3;

interface ShiftBand {
  startHour: number;
  endHour: number;
  startPct: number;
  widthPct: number;
}

interface HourAxis {
  bands: ShiftBand[];
  breaks: { startPct: number; widthPct: number; label: string }[];
}

function buildHourAxis(shifts: string[]): HourAxis {
  const toHours = (value: string): number => {
    const [hour, minute] = value.split(':').map(Number);
    return (hour ?? 0) + (minute ?? 0) / 60;
  };

  const parsed = shifts
    .map((shift) => {
      const [from, to] = shift.split('-');
      return { startHour: toHours(from ?? '0:00'), endHour: toHours(to ?? '0:00') };
    })
    .filter((shift) => shift.endHour > shift.startHour)
    .sort((a, b) => a.startHour - b.startHour);

  const workingHours = parsed.reduce((acc, shift) => acc + (shift.endHour - shift.startHour), 0);
  const breakCount = Math.max(0, parsed.length - 1);
  const available = Math.max(1, 100 - breakCount * BREAK_PCT);

  const bands: ShiftBand[] = [];
  const breaks: HourAxis['breaks'] = [];
  let cursor = 0;

  parsed.forEach((shift, index) => {
    const widthPct = ((shift.endHour - shift.startHour) / Math.max(0.5, workingHours)) * available;
    bands.push({ ...shift, startPct: cursor, widthPct });
    cursor += widthPct;

    const next = parsed[index + 1];
    if (next) {
      breaks.push({
        startPct: cursor,
        widthPct: BREAK_PCT,
        label: `${formatHour(shift.endHour)} – ${formatHour(next.startHour)}`,
      });
      cursor += BREAK_PCT;
    }
  });

  return { bands, breaks };
}

function formatHour(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function projectHour(hour: number, axis: HourAxis): number {
  const first = axis.bands[0];
  const last = axis.bands[axis.bands.length - 1];
  if (!first || !last) return 0;

  if (hour <= first.startHour) return 0;
  if (hour >= last.endHour) return last.startPct + last.widthPct;

  for (const band of axis.bands) {
    if (hour <= band.endHour) {
      if (hour < band.startHour) return band.startPct;
      return (
        band.startPct + ((hour - band.startHour) / (band.endHour - band.startHour)) * band.widthPct
      );
    }
  }

  return last.startPct + last.widthPct;
}

function packIntoLanes(blocks: Omit<Block, 'lane' | 'lanes'>[]): Block[] {
  const sorted = [...blocks].sort(
    (a, b) => a.from - b.from || a.issueKey.localeCompare(b.issueKey),
  );
  const packed: Block[] = [];

  let group: Block[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const closeGroup = () => {
    const lanes = group.reduce((max, block) => Math.max(max, block.lane + 1), 0);
    for (const block of group) block.lanes = lanes;
    packed.push(...group);
    group = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  };

  for (const block of sorted) {
    if (block.from >= groupEnd && group.length > 0) closeGroup();

    const laneEnds: number[] = [];
    for (const existing of group) {
      laneEnds[existing.lane] = Math.max(laneEnds[existing.lane] ?? 0, existing.to);
    }

    let lane = 0;
    while ((laneEnds[lane] ?? 0) > block.from) lane += 1;

    group.push({ ...block, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, block.to);
  }

  if (group.length > 0) closeGroup();

  return packed;
}

function collectBlocks(report: MonthlyReport): Omit<Block, 'lane' | 'lanes'>[] {
  const blocks: Omit<Block, 'lane' | 'lanes'>[] = [];

  for (const issue of report.issues) {
    for (const segment of issue.segments) {
      if (segment.terminal) continue;
      segment.work_intervals.forEach((interval, index) => {
        blocks.push({
          issueKey: issue.issue_key,
          summary: issue.summary,
          statusName: segment.status_name,
          category: segment.category,
          from: Date.parse(interval.from),
          to: Date.parse(interval.to),
          open: segment.open,
          isSegmentEnd: index === segment.work_intervals.length - 1,
        });
      });
    }
  }

  return blocks;
}

const LANE_HEIGHT = 22;

export function DayView({ report }: { report: MonthlyReport }) {
  const timezone = report.work_schedule.timezone;
  const axis = buildHourAxis(report.work_schedule.shifts);
  const start = axis.bands[0]?.startHour ?? 0;
  const end = axis.bands[axis.bands.length - 1]?.endHour ?? 24;

  const blocks = packIntoLanes(collectBlocks(report));
  const maxLanes = blocks.reduce((max, block) => Math.max(max, block.lane + 1), 1);
  const trackHeight = maxLanes * LANE_HEIGHT;
  const pct = (hour: number): number => projectHour(hour, axis);

  const ticks: number[] = [];
  for (const band of axis.bands) {
    for (let hour = Math.ceil(band.startHour); hour <= Math.floor(band.endHour); hour += 1) {
      ticks.push(hour);
    }
  }

  const generatedAt = Date.parse(report.generated_at);
  const nowHour = hourFraction(generatedAt, timezone);
  const withinDay =
    generatedAt >= Date.parse(report.from) &&
    generatedAt < Date.parse(report.to) &&
    nowHour > start &&
    nowHour < end;

  if (blocks.length === 0) {
    return (
      <p className="py-12 text-center text-slate-500">
        No hay actividad en horario laboral este día.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-5">
        {ticks.map((hour) => (
          <span
            key={hour}
            className="absolute -translate-x-1/2 text-[10px] text-slate-400 tabular-nums"
            style={{ left: `${pct(hour)}%` }}
          >
            {String(hour).padStart(2, '0')}
          </span>
        ))}
      </div>

      <div
        className="relative rounded-md border border-slate-200 bg-white"
        style={{ height: trackHeight + 8 }}
      >
        {ticks.map((hour) => (
          <div
            key={hour}
            className="absolute top-0 bottom-0 w-px bg-slate-100"
            style={{ left: `${pct(hour)}%` }}
          />
        ))}

        {axis.breaks.map((gap) => (
          <div
            key={gap.label}
            className="absolute top-0 bottom-0 bg-slate-200/80"
            style={{ left: `${gap.startPct}%`, width: `${gap.widthPct}%` }}
            title={`Fuera de horario · ${gap.label}`}
          />
        ))}

        {withinDay && (
          <div
            className="absolute top-0 bottom-0 z-20 w-px bg-red-500"
            style={{ left: `${pct(nowHour)}%` }}
          />
        )}

        <div className="relative p-1" style={{ height: trackHeight + 8 }}>
          {blocks
            .filter(
              (block) =>
                block.open && block.isSegmentEnd && pct(hourFraction(block.to, timezone)) < 99.5,
            )
            .map((block) => {
              const from = pct(hourFraction(block.to, timezone));
              return (
                <div
                  key={`trail-${block.issueKey}-${block.from}`}
                  className="pointer-events-none absolute border-t-2 border-dashed"
                  style={{
                    left: `${from}%`,
                    width: `${100 - from}%`,
                    top: block.lane * LANE_HEIGHT + (LANE_HEIGHT - 3) / 2,
                    borderColor: report.category_colors[block.category] ?? '#ec4899',
                    opacity: 0.55,
                  }}
                />
              );
            })}

          {blocks.map((block) => {
            const left = pct(hourFraction(block.from, timezone));
            const right = pct(hourFraction(block.to, timezone));
            const width = Math.max(0.4, right - left);

            return (
              <div
                key={`${block.issueKey}-${block.from}-${block.lane}`}
                className="absolute flex items-center overflow-hidden rounded-sm px-1.5 text-[10px] leading-none text-white/95"
                style={{
                  left: `${left}%`,
                  width: `max(4px, calc(${width}% - 2px))`,
                  top: block.lane * LANE_HEIGHT,
                  height: LANE_HEIGHT - 3,
                  background: report.category_colors[block.category] ?? '#ec4899',
                }}
                title={`${block.issueKey} · ${block.statusName} · ${categoryLabel(block.category)} · ${formatDuration(
                  Math.round((block.to - block.from) / 1000),
                )}`}
              >
                <span className="truncate font-mono font-semibold">{block.issueKey}</span>
                <span className="truncate pl-1.5 opacity-75">{block.statusName}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

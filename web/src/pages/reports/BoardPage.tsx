import { Board } from '@/components/Board';
import { useReports } from '@/pages/reports/ReportsLayout';

export function BoardPage() {
  const { view, timelineReport } = useReports();

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-tight">Tablero</h2>
      {view.matchedIssues === 0 ? (
        <p className="pb-2 text-xs text-slate-500">Ningún issue coincide con el filtro.</p>
      ) : (
        <Board report={timelineReport} />
      )}
    </section>
  );
}

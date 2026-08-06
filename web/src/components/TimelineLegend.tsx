import type { MonthlyReport, Span } from '@/lib/report';

export function TimelineLegend({ report, span }: { report: MonthlyReport; span: Span }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-500">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-px bg-red-500" />
        Ahora
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-flex items-center">
          <span className="inline-block h-3 w-3 rounded-l-sm bg-slate-400" />
          <span className="inline-block w-5 border-t-2 border-dashed border-slate-400" />
        </span>
        Sigue abierto
      </li>
      {span === 'month' ? (
        <li>
          El eje muestra solo horario laboral: cada columna es un día hábil de{' '}
          {report.work_schedule.shifts.join(' + ')}. Noches y fines de semana no ocupan lugar.
        </li>
      ) : (
        <li>
          Los issues en paralelo comparten el bloque y se dibujan divididos; el total de cada uno
          cuenta las horas completas.
        </li>
      )}
    </ul>
  );
}

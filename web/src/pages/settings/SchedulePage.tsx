import { useQuery } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { scheduleQuery, useAdminMutation, type WorkShift } from '@/lib/admin';
import { api } from '@/lib/api';
import { formatIsoDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState, LoadingBlock, Notice, QueryError } from '@/pages/settings/shared';

const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

function shiftsError(shifts: WorkShift[]): string | null {
  if (shifts.length === 0) return 'Tiene que haber al menos un turno.';
  for (const [index, shift] of shifts.entries()) {
    if (!shift.from || !shift.to) return 'Completá todas las horas.';
    if (shift.from >= shift.to) return `El turno ${index + 1} termina antes de empezar.`;
    const previous = shifts[index - 1];
    if (previous && previous.to > shift.from) {
      return `El turno ${index + 1} se pisa con el anterior.`;
    }
  }
  return null;
}

interface EditableShift extends WorkShift {
  id: number;
}

let shiftSequence = 0;

function withIds(list: WorkShift[]): EditableShift[] {
  return list.map((shift) => {
    shiftSequence += 1;
    return { ...shift, id: shiftSequence };
  });
}

function WorkScheduleCard({
  days: initialDays,
  shifts: initialShifts,
  timezone,
}: {
  days: number[];
  shifts: WorkShift[];
  timezone: string;
}) {
  const [days, setDays] = useState(initialDays);
  const [shifts, setShifts] = useState(() => withIds(initialShifts));

  useEffect(() => {
    setDays(initialDays);
    setShifts(withIds(initialShifts));
  }, [initialDays, initialShifts]);

  const plainShifts = shifts.map(({ from, to }) => ({ from, to }));
  const dirty =
    JSON.stringify([...days].sort()) !== JSON.stringify([...initialDays].sort()) ||
    JSON.stringify(plainShifts) !== JSON.stringify(initialShifts);
  const error = shiftsError(plainShifts);

  const save = useAdminMutation(
    () => api('/api/admin/schedule', { method: 'PUT', body: { days, shifts: plainShifts } }),
    { success: 'Horario guardado. Todo el historial se recalculó con el horario nuevo.' },
  );

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );

  const updateShift = (index: number, patch: Partial<WorkShift>) =>
    setShifts((current) =>
      current.map((shift, position) => (position === index ? { ...shift, ...patch } : shift)),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario laboral</CardTitle>
        <CardDescription>
          Solo se cuenta el tiempo dentro de estos turnos ({timezone}). Cambiarlo recalcula todo el
          historial, no solo lo que viene.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>Días hábiles</Label>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((day) => {
              const active = days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    'h-8 w-12 cursor-pointer border text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-muted-foreground hover:bg-accent',
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Turnos</Label>
          {shifts.map((shift, index) => (
            <div key={shift.id} className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted-foreground">Turno {index + 1}</span>
              <Input
                type="time"
                value={shift.from}
                onChange={(event) => updateShift(index, { from: event.target.value })}
                className="h-8 w-28 text-xs"
                aria-label={`Inicio del turno ${index + 1}`}
              />
              <span className="text-xs text-muted-foreground">a</span>
              <Input
                type="time"
                value={shift.to}
                onChange={(event) => updateShift(index, { to: event.target.value })}
                className="h-8 w-28 text-xs"
                aria-label={`Fin del turno ${index + 1}`}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={shifts.length === 1}
                onClick={() =>
                  setShifts((current) => current.filter((_, position) => position !== index))
                }
                aria-label={`Quitar turno ${index + 1}`}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              size="xs"
              disabled={shifts.length >= 6}
              onClick={() => {
                const last = shifts.at(-1);
                setShifts((current) => [
                  ...current,
                  ...withIds([{ from: last?.to ?? '09:00', to: '' }]),
                ]);
              }}
            >
              <PlusIcon /> Agregar turno
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!dirty || error !== null || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending ? 'Guardando…' : 'Guardar horario'}
          </Button>
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDays(initialDays);
                setShifts(withIds(initialShifts));
              }}
            >
              Descartar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HolidaysCard({ holidays }: { holidays: { date: string; label: string }[] }) {
  const thisYear = new Date().getFullYear();
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [presetYear, setPresetYear] = useState(thisYear);

  const add = useAdminMutation(
    () => api('/api/admin/holidays', { method: 'POST', body: { date, label: label.trim() } }),
    {
      success: 'Feriado agregado.',
      onSuccess: () => {
        setDate('');
        setLabel('');
      },
    },
  );
  const remove = useAdminMutation((day: string) =>
    api(`/api/admin/holidays/${day}`, { method: 'DELETE' }),
  );
  const preset = useAdminMutation(
    (year: number) =>
      api<{ inserted: number }>('/api/admin/holidays/uruguay', { method: 'POST', body: { year } }),
    {
      success: (result) =>
        result.inserted === 0
          ? 'Ya estaban todos cargados.'
          : `Se agregaron ${result.inserted} feriados.`,
    },
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(undefined);
  };

  const byYear = new Map<string, { date: string; label: string }[]>();
  for (const holiday of holidays) {
    const year = holiday.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), holiday]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feriados</CardTitle>
        <CardDescription>Un feriado no suma horas, igual que un fin de semana.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-year">Feriados de Uruguay</Label>
            <select
              id="preset-year"
              value={presetYear}
              onChange={(event) => setPresetYear(Number(event.target.value))}
              className="h-8 border border-input bg-background px-2 text-xs"
            >
              {[thisYear - 1, thisYear, thisYear + 1].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={preset.isPending}
            onClick={() => preset.mutate(presetYear)}
          >
            Cargar no laborables, Carnaval y Turismo
          </Button>
        </div>

        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holiday-date">Fecha</Label>
            <Input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-8 w-40 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holiday-label">Nombre</Label>
            <Input
              id="holiday-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Día libre del equipo"
              className="h-8 w-56 text-xs"
            />
          </div>
          <Button type="submit" size="sm" disabled={!date || !label.trim() || add.isPending}>
            <PlusIcon /> Agregar
          </Button>
        </form>

        {holidays.length === 0 ? (
          <EmptyState title="No hay feriados cargados" />
        ) : (
          <div className="flex flex-col gap-4">
            {[...byYear.entries()].map(([year, items]) => (
              <div key={year}>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{year}</h4>
                <ul className="border border-border">
                  {items.map((holiday) => (
                    <li
                      key={holiday.date}
                      className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs last:border-b-0"
                    >
                      <span className="inline-block w-48 tabular-nums first-letter:uppercase">
                        {formatIsoDate(holiday.date)}
                      </span>
                      <span className="flex-1">{holiday.label}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(holiday.date)}
                        aria-label={`Quitar ${holiday.label}`}
                      >
                        <Trash2Icon />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SchedulePage() {
  const query = useQuery(scheduleQuery);

  return (
    <SettingsPage>
      <PageHeader
        title="Horario y feriados"
        description="Define qué horas cuentan como trabajo. Se aplica al consultar, así que corregir el horario corrige también los meses anteriores."
      />
      {query.isPending && <LoadingBlock rows={4} />}
      {query.isError && <QueryError error={query.error} />}
      {query.data && (
        <div className="grid gap-6 xl:grid-cols-2">
          <WorkScheduleCard
            days={query.data.schedule.days}
            shifts={query.data.schedule.shifts}
            timezone={query.data.timezone}
          />
          <HolidaysCard holidays={query.data.holidays} />
        </div>
      )}
      <Notice>
        La carga automática trae los 5 feriados no laborables más Carnaval y Semana de Turismo. Los
        feriados laborables (6/1, 19/4, 18/5, 19/6, 12/10, 2/11) no se cargan; si el equipo no
        trabaja esos días, agregalos a mano.
      </Notice>
    </SettingsPage>
  );
}

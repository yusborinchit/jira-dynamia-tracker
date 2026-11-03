import { useQuery } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';

import { PageHeader, SettingsPage } from '@/components/layout/AppShell';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type AdminCategory, categoriesQuery, useAdminMutation } from '@/lib/admin';
import { api } from '@/lib/api';
import type { CategoryRole } from '@/lib/report';
import { LoadingBlock, Notice, QueryError } from '@/pages/settings/shared';

const ROLE_LABELS: Record<CategoryRole, string> = {
  active: 'Trabajo activo',
  waiting: 'En espera',
  terminal: 'Final (no suma)',
};

interface CategoryDraft {
  label: string;
  color: string;
  role: CategoryRole;
  alertHours: string;
}

function draftOf(category: AdminCategory): CategoryDraft {
  return {
    label: category.label,
    color: category.color,
    role: category.role,
    alertHours:
      category.alert_after_seconds === null ? '' : String(category.alert_after_seconds / 3600),
  };
}

function alertSeconds(hours: string): number | null {
  const value = Number(hours.replace(',', '.'));
  return hours.trim() === '' || !Number.isFinite(value) || value <= 0
    ? null
    : Math.round(value * 3600);
}

function bodyOf(draft: CategoryDraft) {
  return {
    label: draft.label.trim(),
    color: draft.color,
    role: draft.role,
    alert_after_seconds: draft.role === 'terminal' ? null : alertSeconds(draft.alertHours),
  };
}

function RoleSelect({
  value,
  onChange,
}: {
  value: CategoryRole;
  onChange: (role: CategoryRole) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as CategoryRole)}>
      <SelectTrigger size="sm" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ROLE_LABELS) as CategoryRole[]).map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategoryFields({
  draft,
  onChange,
}: {
  draft: CategoryDraft;
  onChange: (draft: CategoryDraft) => void;
}) {
  const alertId = useId();
  return (
    <>
      <input
        type="color"
        value={draft.color}
        onChange={(event) => onChange({ ...draft, color: event.target.value })}
        className="h-8 w-10 flex-none cursor-pointer border border-input bg-background p-0.5"
        aria-label="Color"
      />
      <Input
        value={draft.label}
        onChange={(event) => onChange({ ...draft, label: event.target.value })}
        className="h-8 w-48 text-xs"
        aria-label="Nombre"
      />
      <RoleSelect value={draft.role} onChange={(role) => onChange({ ...draft, role })} />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <label htmlFor={alertId}>Alerta después de</label>
        <Input
          id={alertId}
          type="number"
          min={0}
          step={0.5}
          value={draft.role === 'terminal' ? '' : draft.alertHours}
          disabled={draft.role === 'terminal'}
          onChange={(event) => onChange({ ...draft, alertHours: event.target.value })}
          placeholder="—"
          className="h-8 w-20 text-xs"
          aria-label="Horas hábiles antes de alertar"
        />
        h hábiles
      </div>
    </>
  );
}

function CategoryRow({
  category,
  isFirst,
  isLast,
  onMove,
}: {
  category: AdminCategory;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(category));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setDraft(draftOf(category)), [category]);

  const original = draftOf(category);
  const dirty = JSON.stringify(bodyOf(draft)) !== JSON.stringify(bodyOf(original));

  const save = useAdminMutation(
    () => api(`/api/admin/categories/${category.key}`, { method: 'PUT', body: bodyOf(draft) }),
    { success: `Categoría "${draft.label}" guardada.` },
  );
  const remove = useAdminMutation(
    () => api(`/api/admin/categories/${category.key}`, { method: 'DELETE' }),
    { success: `Categoría "${category.label}" borrada.`, onSettled: () => setConfirmDelete(false) },
  );

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex flex-col">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          disabled={isFirst}
          onClick={() => onMove(-1)}
          aria-label="Subir"
        >
          <ArrowUpIcon className="size-3!" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          disabled={isLast}
          onClick={() => onMove(1)}
          aria-label="Bajar"
        >
          <ArrowDownIcon className="size-3!" />
        </Button>
      </div>
      <CategoryFields draft={draft} onChange={setDraft} />
      <span className="font-mono text-[10px] text-muted-foreground">{category.key}</span>
      <span className="text-[11px] text-muted-foreground">
        {category.mappings} estado{category.mappings === 1 ? '' : 's'}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {dirty && (
          <>
            <Button size="xs" variant="ghost" onClick={() => setDraft(original)}>
              Descartar
            </Button>
            <Button
              size="xs"
              disabled={save.isPending || draft.label.trim() === ''}
              onClick={() => save.mutate(undefined)}
            >
              Guardar
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={category.protected}
          title={
            category.protected
              ? 'Se usa para el panel de trabajo actual'
              : category.mappings > 0
                ? 'Reasigná sus estados antes de borrarla'
                : 'Borrar'
          }
          onClick={() => setConfirmDelete(true)}
          aria-label={`Borrar ${category.label}`}
        >
          <Trash2Icon />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`¿Borrar "${category.label}"?`}
        description="Solo se puede borrar si ningún estado está mapeado a ella."
        confirmLabel="Borrar"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </li>
  );
}

function NewCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [key, setKey] = useState('');
  const [draft, setDraft] = useState<CategoryDraft>({
    label: '',
    color: '#64748b',
    role: 'active',
    alertHours: '',
  });

  const create = useAdminMutation(
    () => api('/api/admin/categories', { method: 'POST', body: { key, ...bodyOf(draft) } }),
    {
      success: 'Categoría creada.',
      onSuccess: () => {
        onOpenChange(false);
        setKey('');
        setDraft({ label: '', color: '#64748b', role: 'active', alertHours: '' });
      },
    },
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
            <DialogDescription>
              La clave es interna y no se puede cambiar después: minúsculas, números y guiones
              bajos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-key">Clave</Label>
            <Input
              id="category-key"
              value={key}
              onChange={(event) =>
                setKey(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
              }
              placeholder="code_review"
              className="w-60 font-mono"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryFields draft={draft} onChange={setDraft} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !key || !draft.label.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesPage() {
  const query = useQuery(categoriesQuery);
  const [creating, setCreating] = useState(false);
  const categories = query.data?.categories ?? [];

  const reorder = useAdminMutation((keys: string[]) =>
    api('/api/admin/categories/order', { method: 'PUT', body: { keys } }),
  );

  const move = (index: number, direction: -1 | 1) => {
    const keys = categories.map((category) => category.key);
    const target = index + direction;
    const current = keys[index];
    const other = keys[target];
    if (current === undefined || other === undefined) return;
    keys[index] = other;
    keys[target] = current;
    reorder.mutate(keys);
  };

  return (
    <SettingsPage>
      <PageHeader
        title="Categorías"
        description="Agrupan los estados de Jira. El orden define las columnas del tablero y cómo se ordena la tabla por estado actual."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon /> Nueva categoría
          </Button>
        }
      />

      <Notice>
        <strong>Trabajo activo</strong> y <strong>En espera</strong> suman horas;{' '}
        <strong>Final</strong> marca que la tarea terminó y no suma. La alerta marca en el tablero y
        en la tabla las tareas que llevan más horas hábiles que eso en su estado actual.
      </Notice>

      {query.isPending && <LoadingBlock rows={6} />}
      {query.isError && <QueryError error={query.error} />}
      {query.data && (
        <ul className="border border-border">
          {categories.map((category, index) => (
            <CategoryRow
              key={category.key}
              category={category}
              isFirst={index === 0}
              isLast={index === categories.length - 1}
              onMove={(direction) => move(index, direction)}
            />
          ))}
        </ul>
      )}

      <NewCategoryDialog open={creating} onOpenChange={setCreating} />
    </SettingsPage>
  );
}

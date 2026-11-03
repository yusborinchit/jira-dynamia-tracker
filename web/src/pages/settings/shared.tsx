import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { categoriesQuery } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export const NO_CATEGORY = '__none__';

export function Swatch({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 flex-none', className)}
      style={{ background: color ?? '#ec4899' }}
      aria-hidden="true"
    />
  );
}

export function CategorySelect({
  value,
  onChange,
  disabled,
  allowNone = true,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  className?: string;
}) {
  const categories = useQuery(categoriesQuery).data?.categories ?? [];

  return (
    <Select
      value={value ?? NO_CATEGORY}
      onValueChange={(next) => onChange(next === NO_CATEGORY ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className={cn('w-48', value === null && 'border-amber-500', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && (
          <SelectItem value={NO_CATEGORY}>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Swatch color="#ec4899" /> Sin categoría
            </span>
          </SelectItem>
        )}
        {categories.map((category) => (
          <SelectItem key={category.key} value={category.key}>
            <span className="flex items-center gap-2">
              <Swatch color={category.color} />
              {category.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

export function LoadingBlock({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {SKELETON_ROWS.slice(0, rows).map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function QueryError({ error }: { error: unknown }) {
  return (
    <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {errorMessage(error)}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'border px-3 py-2 text-xs',
        tone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          : 'border-border bg-muted/60 text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
}

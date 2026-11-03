import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = false,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
          <div className="flex flex-col gap-1.5">
            <AlertDialogPrimitive.Title className="text-base font-semibold">
              {title}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </AlertDialogPrimitive.Description>
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" size="sm">
                Cancelar
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              size="sm"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? 'Aplicando…' : confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export type ConfirmDialogProps = ComponentProps<typeof ConfirmDialog>;

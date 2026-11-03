import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'rounded-none! border! border-border! bg-popover! text-popover-foreground! shadow-xl! text-sm!',
          description: 'text-muted-foreground!',
          error: 'border-destructive/40!',
        },
      }}
    />
  );
}

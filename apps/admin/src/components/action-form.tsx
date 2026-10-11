'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/actions';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** A form bound to a server action, with pending state and a result message. */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = 'primary',
  className,
  confirm,
  inline = false,
  id,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  submitVariant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  /** Ask before submitting (destructive actions). */
  confirm?: string;
  inline?: boolean;
  /** Lets inputs elsewhere on the page join this form via form="id". */
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      id={id}
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn(inline ? 'flex flex-wrap items-end gap-2' : 'space-y-4', className)}
    >
      {children}
      <div className={cn('flex items-center gap-3', inline && 'contents')}>
        <Submit label={submitLabel} variant={submitVariant} small={inline} />
        {state ? (
          <p role="status" className={cn('text-sm', state.ok ? 'text-green-700' : 'text-red-700')}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Submit({ label, variant, small }: { label: string; variant: 'primary' | 'secondary' | 'danger' | 'ghost'; small: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={small ? 'sm' : 'md'} disabled={pending} aria-busy={pending}>
      {pending ? 'Working…' : label}
    </Button>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ title, description, actions, children, className }: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border border-zinc-200 bg-white shadow-xs', className)}>
      {title ? (
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-zinc-500">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

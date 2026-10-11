import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-zinc-700 hover:bg-zinc-100',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

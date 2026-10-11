'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SyncStep } from '@/app/events/[eventId]/actions';
import { Button } from './ui/button';

/** Runs a Luma sync to completion, resuming the run across function calls. */
export function SyncButton({ step }: { step: (runId?: string) => Promise<SyncStep> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () =>
    start(async () => {
      setMessage({ ok: true, text: 'Syncing from Luma…' });
      let runId: string | undefined;
      let guests = 0;
      let tickets = 0;
      for (let i = 0; i < 40; i++) {
        const res = await step(runId);
        if (!res.ok) {
          setMessage({ ok: false, text: res.message });
          router.refresh();
          return;
        }
        runId = res.runId;
        // Totals are cumulative for the run.
        guests = res.guests;
        tickets = res.tickets;
        if (res.done) {
          setMessage({ ok: true, text: `Sync complete: ${guests} guests and ${tickets} tickets processed.` });
          router.refresh();
          return;
        }
        setMessage({ ok: true, text: `Syncing… ${guests} guests so far` });
      }
      setMessage({ ok: false, text: 'Sync is taking unusually long; it will continue on the next run.' });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={run} disabled={pending} aria-busy={pending}>
        {pending ? 'Syncing…' : 'Sync now'}
      </Button>
      {message ? (
        <p role="status" className={message.ok ? 'text-sm text-zinc-700' : 'text-sm text-red-700'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

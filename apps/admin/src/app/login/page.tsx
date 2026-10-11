import { ActionForm } from '@/components/action-form';
import { Field, Input } from '@/components/ui/field';
import { sendSignInLink } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Nashville Takeover</h1>
      <p className="mt-1 text-sm text-zinc-600">Event dashboard for managers and admins.</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      ) : null}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-xs">
        <ActionForm action={sendSignInLink} submitLabel="Email me a sign-in link">
          <Field label="Work email">
            <Input type="email" name="email" autoComplete="email" required placeholder="you@example.com" />
          </Field>
        </ActionForm>
      </div>
    </main>
  );
}

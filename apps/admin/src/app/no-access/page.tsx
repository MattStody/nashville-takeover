import { getViewer } from '@/lib/auth';

export default async function NoAccess() {
  const viewer = await getViewer();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-xl font-semibold">No dashboard access yet</h1>
      <p className="mt-2 text-sm text-zinc-600">
        You are signed in as <strong>{viewer.email}</strong>, but you are not a manager of any event. Ask an admin
        to invite you. Staff check-in happens in the mobile app.
      </p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="text-sm font-medium text-brand underline">Sign out</button>
      </form>
    </main>
  );
}

import { Body, Button, EmptyState, ErrorState, Loading, Screen } from './ui';
import { useCurrentEvent } from '@/lib/event-context';
import { useAuth } from '@/lib/auth';

/** Shown on every tab while events load, fail, or when there are none to show. */
export function NoEventGuard() {
  const { loading, error, refetch } = useCurrentEvent();
  const { session, signOut } = useAuth();
  if (loading) return <Loading />;
  return (
    <Screen>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <EmptyState
          title="No events yet"
          message={`We couldn't find a ticket for ${session?.user.email ?? 'this email'}. Tickets are matched by the email you used on Luma.`}
          action={<Button label="Check again" variant="secondary" onPress={refetch} />}
        />
      )}
      <Body muted style={{ textAlign: 'center' }}>
        Signed in as {session?.user.email}
      </Body>
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

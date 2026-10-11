import { formatInZone } from '@nt/shared';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { EventHeader } from '@/components/event-header';
import { NoEventGuard } from '@/components/no-event';
import { Body, Card, EmptyState, ErrorState, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCurrentEvent } from '@/lib/event-context';
import { markRead, useUpdates } from '@/lib/queries';
import { colors, fonts, space } from '@/theme';

export default function UpdatesScreen() {
  const { event } = useCurrentEvent();
  const { session } = useAuth();
  const updates = useUpdates(event?.id);

  const unread = (updates.data ?? []).filter((u) => !u.read).map((u) => u.id);
  useEffect(() => {
    if (session && unread.length) markRead(unread, session.user.id).catch(() => {});
  }, [unread.join(','), session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!event) return <NoEventGuard />;

  return (
    <Screen refreshing={updates.isRefetching} onRefresh={() => updates.refetch()}>
      <EventHeader event={event} title="Updates" compact />
      {updates.isLoading ? (
        <Loading />
      ) : updates.error ? (
        <ErrorState error={updates.error} onRetry={() => updates.refetch()} />
      ) : (updates.data ?? []).length === 0 ? (
        <EmptyState title="No updates yet" message="Announcements from the event team will show up here." />
      ) : (
        (updates.data ?? []).map((u) => (
          <Card key={u.id} style={{ gap: space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              {!u.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.orange }} /> : null}
              <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.darkTeal }}>{u.title}</Text>
            </View>
            <Body>{u.body}</Body>
            {u.sent_at ? <Body muted>{formatInZone(u.sent_at, event.timezone, { weekday: undefined })}</Body> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

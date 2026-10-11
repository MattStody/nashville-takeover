import { formatInZone, type Tables } from '@nt/shared';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Screen, Subhead, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCurrentEvent } from '@/lib/event-context';
import { colors, fonts, space } from '@/theme';

export default function EventsScreen() {
  const { mine, others, event: current, select } = useCurrentEvent();
  const { session, signOut } = useAuth();

  const row = (e: Tables<'events'>, owned: boolean) => (
    <Pressable
      key={e.id}
      onPress={() => {
        select(e.id);
        router.back();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: e.id === current?.id }}
      style={({ pressed }) => [
        styles.card,
        { gap: 4, opacity: pressed ? 0.8 : 1 },
        e.id === current?.id && { borderColor: colors.orange, borderWidth: 2 },
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.darkTeal }}>{e.name}</Text>
        {owned ? <Badge label="Your ticket" /> : null}
      </View>
      <Body muted>
        {formatInZone(e.starts_at, e.timezone)}
        {e.venue_name ? ` · ${e.venue_name}` : ''}
      </Body>
    </Pressable>
  );

  return (
    <Screen>
      {mine.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Subhead>Your events</Subhead>
          {mine.map((e) => row(e, true))}
        </View>
      ) : null}
      {others.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Subhead>More events</Subhead>
          {others.map((e) => row(e, false))}
        </View>
      ) : null}
      <Card style={{ gap: space.sm }}>
        <Subhead>Account</Subhead>
        <Body>Signed in as {session?.user.email}</Body>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { EventHeader } from '@/components/event-header';
import { NoEventGuard } from '@/components/no-event';
import { Body, EmptyState, ErrorState, Loading, Screen, styles } from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { useCurrentEvent } from '@/lib/event-context';
import { useSponsors } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';

export default function SponsorsScreen() {
  const { event } = useCurrentEvent();
  const sponsors = useSponsors(event?.id);
  if (!event) return <NoEventGuard />;

  return (
    <Screen refreshing={sponsors.isRefetching} onRefresh={() => sponsors.refetch()}>
      <EventHeader event={event} title="Sponsors" compact />
      {sponsors.isLoading ? (
        <Loading />
      ) : sponsors.error ? (
        <ErrorState error={sponsors.error} onRetry={() => sponsors.refetch()} />
      ) : (sponsors.data ?? []).length === 0 ? (
        <EmptyState title="Sponsors coming soon" message="Check back closer to the event." />
      ) : (
        (sponsors.data ?? []).map((s) => {
          const logo = mediaUrl(s.logo_path);
          return (
            <Pressable
              key={s.id}
              onPress={() => router.push({ pathname: '/sponsor/[id]', params: { id: s.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${s.sponsor_name}${s.location ? `, ${s.location}` : ''}`}
              style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.white, overflow: 'hidden' }}>
                {logo ? <Image source={logo} style={{ width: 64, height: 64 }} contentFit="contain" accessible={false} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.darkTeal }}>{s.sponsor_name}</Text>
                {s.location ? <Body muted>{s.location}</Body> : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.teal} />
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

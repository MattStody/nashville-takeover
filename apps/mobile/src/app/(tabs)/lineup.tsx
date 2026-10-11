import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EventHeader } from '@/components/event-header';
import { NoEventGuard } from '@/components/no-event';
import { Badge, Body, Card, EmptyState, ErrorState, Loading, Screen, Subhead } from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { useCurrentEvent } from '@/lib/event-context';
import { groupLineupByDay, setStatus, timeRange } from '@/lib/logic';
import { useLineup, useToggleFavorite } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';

export default function LineupScreen() {
  const { event } = useCurrentEvent();
  const lineup = useLineup(event?.id);
  const toggle = useToggleFavorite(event?.id);
  const [mineOnly, setMineOnly] = useState(false);

  const days = useMemo(() => {
    if (!event || !lineup.data) return [];
    const items = mineOnly ? lineup.data.items.filter((i) => lineup.data!.favorites.has(i.id)) : lineup.data.items;
    return groupLineupByDay(items, event.timezone);
  }, [event, lineup.data, mineOnly]);

  if (!event) return <NoEventGuard />;

  return (
    <Screen refreshing={lineup.isRefetching} onRefresh={() => lineup.refetch()}>
      <EventHeader event={event} title="Lineup" compact />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Everyone" active={!mineOnly} onPress={() => setMineOnly(false)} />
        <Chip label="My schedule" active={mineOnly} onPress={() => setMineOnly(true)} />
      </View>

      {lineup.isLoading ? (
        <Loading />
      ) : lineup.error ? (
        <ErrorState error={lineup.error} onRetry={() => lineup.refetch()} />
      ) : days.length === 0 ? (
        <EmptyState
          title={mineOnly ? 'No favourites yet' : 'Lineup coming soon'}
          message={mineOnly ? 'Tap the star on a set to add it to your schedule.' : 'Check back closer to the event.'}
        />
      ) : (
        days.map(({ day, items }) => (
          <View key={day} style={{ gap: space.sm }}>
            <Subhead>{day}</Subhead>
            {items.map((item) => {
              const fav = lineup.data!.favorites.has(item.id);
              const status = setStatus(item);
              const img = mediaUrl(item.image_path);
              return (
                <Card key={item.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', opacity: status === 'done' ? 0.6 : 1 }}>
                  {img ? (
                    <Image source={img} style={{ width: 56, height: 56, borderRadius: radius.sm }} contentFit="cover" accessible={false} />
                  ) : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.darkTeal }}>{item.artist}</Text>
                    <Body muted>
                      {timeRange(item.starts_at, item.ends_at, event.timezone)} · {item.stage}
                    </Body>
                    {item.description ? <Body numberOfLines={2}>{item.description}</Body> : null}
                    {status === 'live' ? <Badge label="On now" tone="orange" /> : null}
                  </View>
                  <Pressable
                    onPress={() => toggle.mutate({ itemId: item.id, on: !fav })}
                    accessibilityRole="button"
                    accessibilityLabel={fav ? `Remove ${item.artist} from my schedule` : `Add ${item.artist} to my schedule`}
                    accessibilityState={{ selected: fav }}
                    hitSlop={12}
                    style={{ padding: space.sm }}
                  >
                    <Ionicons name={fav ? 'star' : 'star-outline'} size={28} color={fav ? colors.orange : colors.muted} />
                  </Pressable>
                </Card>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        minHeight: 40,
        paddingHorizontal: space.lg,
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: active ? colors.darkTeal : colors.paper,
        borderWidth: 1,
        borderColor: active ? colors.darkTeal : colors.line,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: active ? colors.cream : colors.darkTeal, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </Pressable>
  );
}

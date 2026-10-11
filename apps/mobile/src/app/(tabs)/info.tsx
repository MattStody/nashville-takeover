import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EventHeader } from '@/components/event-header';
import { NoEventGuard } from '@/components/no-event';
import { Body, Card, ErrorState, Loading, Screen, Subhead } from '@/components/ui';
import { mediaUrl } from '@/lib/config';
import { useCurrentEvent } from '@/lib/event-context';
import { useContent } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';

export default function InfoScreen() {
  const { event } = useCurrentEvent();
  const content = useContent(event?.id);
  if (!event) return <NoEventGuard />;

  const items = content.data ?? [];
  const maps = items.filter((i) => i.kind === 'map');
  const info = items.filter((i) => i.kind === 'info');
  const faqs = items.filter((i) => i.kind === 'faq');

  return (
    <Screen refreshing={content.isRefetching} onRefresh={() => content.refetch()}>
      <EventHeader event={event} title="Info" />

      {event.description || event.venue_address ? (
        <Card style={{ gap: space.sm }}>
          <Subhead>About</Subhead>
          {event.description ? <Body>{event.description}</Body> : null}
          {event.venue_address ? (
            <Body muted>
              {event.venue_name ? `${event.venue_name}, ` : ''}
              {event.venue_address}
            </Body>
          ) : null}
        </Card>
      ) : null}

      {content.isLoading ? <Loading /> : content.error ? <ErrorState error={content.error} onRetry={() => content.refetch()} /> : null}

      {maps.map((m) => {
        const img = mediaUrl(m.image_path);
        return (
          <Card key={m.id} style={{ gap: space.sm }}>
            <Subhead>{m.title}</Subhead>
            {img ? (
              <Image
                source={img}
                style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.sm, backgroundColor: colors.creamDeep }}
                contentFit="contain"
                accessibilityLabel={m.title}
              />
            ) : null}
            {m.body ? <Body>{m.body}</Body> : null}
          </Card>
        );
      })}

      {info.map((i) => {
        const img = mediaUrl(i.image_path);
        return (
          <Card key={i.id} style={{ gap: space.sm }}>
            <Subhead>{i.title}</Subhead>
            {img ? <Image source={img} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.sm }} contentFit="cover" /> : null}
            {i.body ? <Body>{i.body}</Body> : null}
          </Card>
        );
      })}

      {faqs.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Subhead>FAQ</Subhead>
          {faqs.map((f) => (
            <Faq key={f.id} question={f.title} answer={f.body ?? ''} />
          ))}
        </View>
      ) : null}

      {!content.isLoading && items.length === 0 && !event.description ? (
        <Body muted style={{ textAlign: 'center' }}>
          More event info is coming soon.
        </Body>
      ) : null}
    </Screen>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ padding: 0 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 52 }}
      >
        <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.darkTeal }}>{question}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.teal} />
      </Pressable>
      {open ? <Body style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>{answer}</Body> : null}
    </Card>
  );
}

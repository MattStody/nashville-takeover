import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Tables } from '@nt/shared';
import { formatInZone } from '@nt/shared';
import { Pressable, Text, View } from 'react-native';
import { mediaUrl } from '@/lib/config';
import { colors, fonts, radius, space } from '@/theme';
import { Body, Headline } from './ui';

/** Event name, dates and hero image, with a tap target to switch events or sign out. */
/** `compact` drops the image and date so list screens get to their content quickly. */
export function EventHeader({ event, title, compact }: { event: Tables<'events'>; title?: string; compact?: boolean }) {
  const hero = mediaUrl(event.hero_image_path);
  const logo = mediaUrl(event.logo_path);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flex: 1 }}>
          {title ? <Headline>{title}</Headline> : null}
          <Body muted numberOfLines={1}>
            {event.name}
          </Body>
        </View>
        <Pressable
          onPress={() => router.push('/events')}
          accessibilityRole="button"
          accessibilityLabel="Switch event or account"
          hitSlop={12}
          style={{ padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.teal, letterSpacing: 0.8 }}>SWITCH</Text>
        </Pressable>
      </View>
      {compact ? null : hero ? (
        <Image
          source={hero}
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.creamDeep }}
          contentFit="cover"
          accessible={false}
        />
      ) : logo ? (
        <Image source={logo} style={{ width: '100%', height: 96 }} contentFit="contain" accessible={false} />
      ) : null}
      {compact ? null : (
        <Body>
        {formatInZone(event.starts_at, event.timezone)}
        {event.venue_name ? `  ·  ${event.venue_name}` : ''}
        </Body>
      )}
    </View>
  );
}

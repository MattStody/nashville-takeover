import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, EmptyState, Headline, Screen, Subhead } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { mediaUrl } from '@/lib/config';
import { useCurrentEvent } from '@/lib/event-context';
import { logSponsorView, useSponsors } from '@/lib/queries';
import { colors, radius, space } from '@/theme';

export default function SponsorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { event } = useCurrentEvent();
  const { session } = useAuth();
  const sponsors = useSponsors(event?.id);
  const sponsor = sponsors.data?.find((s) => s.id === id);

  // One view per visit, for sponsor reporting.
  useEffect(() => {
    if (sponsor && session) logSponsorView(sponsor.id, session.user.id).catch(() => {});
  }, [sponsor?.id, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sponsor) return <Screen>{sponsors.isLoading ? null : <EmptyState title="Sponsor not found" />}</Screen>;
  const logo = mediaUrl(sponsor.logo_path);

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: space.md }}>
        {logo ? (
          <View style={{ width: '100%', height: 160, backgroundColor: colors.white, borderRadius: radius.sm }}>
            <Image source={logo} style={{ flex: 1 }} contentFit="contain" accessibilityLabel={`${sponsor.sponsor_name} logo`} />
          </View>
        ) : null}
        <Headline style={{ textAlign: 'center' }}>{sponsor.sponsor_name}</Headline>
      </Card>
      {sponsor.location ? (
        <Card style={{ gap: space.xs }}>
          <Subhead>Find them</Subhead>
          <Body>{sponsor.location}</Body>
        </Card>
      ) : null}
      {sponsor.description ? (
        <Card>
          <Body>{sponsor.description}</Body>
        </Card>
      ) : null}
      {sponsor.cta_url ? <Button label="Learn more" onPress={() => WebBrowser.openBrowserAsync(sponsor.cta_url!)} /> : null}
    </Screen>
  );
}

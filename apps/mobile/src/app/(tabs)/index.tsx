import { buildCheckInQr, formatInZone } from '@nt/shared';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { EventHeader } from '@/components/event-header';
import { NoEventGuard } from '@/components/no-event';
import { Badge, Body, Button, Card, EmptyState, ErrorState, Loading, Screen, Subhead } from '@/components/ui';
import { useCurrentEvent } from '@/lib/event-context';
import { summarizePerks } from '@/lib/logic';
import { registerForPush } from '@/lib/push';
import { useMyTicket } from '@/lib/queries';
import { colors, fonts, space } from '@/theme';

export default function TicketScreen() {
  const { event, isMine, refetch: refetchEvents } = useCurrentEvent();
  const ticket = useMyTicket(event);

  // Ask once per launch, after sign-in, for a guest who has a ticket.
  useEffect(() => {
    if (isMine) registerForPush();
  }, [isMine]);

  if (!event) return <NoEventGuard />;

  const refresh = () => {
    refetchEvents();
    ticket.refetch();
  };
  const data = ticket.data;
  const guest = data?.guests[0];
  const qr = guest && event.luma_event_id ? buildCheckInQr(event.luma_event_id, guest.guest_key) : null;
  const active = data?.tickets.filter((t) => t.status === 'active') ?? [];
  const perks = summarizePerks(data?.perkRows ?? []);
  const when = (iso: string) => formatInZone(iso, event.timezone, { weekday: undefined });

  return (
    <Screen refreshing={ticket.isRefetching} onRefresh={refresh}>
      <EventHeader event={event} title="My Ticket" />

      {ticket.isLoading ? (
        <Loading />
      ) : ticket.error ? (
        <ErrorState error={ticket.error} onRetry={refresh} />
      ) : !guest ? (
        <EmptyState
          title="No ticket for this event"
          message="Tickets are matched by the email you used on Luma. If you bought with a different email, sign in with that one."
          action={<Button label="Check again" variant="secondary" onPress={refresh} />}
        />
      ) : (
        <>
          <Card style={{ alignItems: 'center', gap: space.md }}>
            <Subhead>Show this at the door</Subhead>
            {qr ? (
              <View
                accessible
                accessibilityLabel="Your check-in QR code"
                style={{ padding: space.md, backgroundColor: colors.white, borderRadius: 12 }}
              >
                <QRCode value={qr} size={240} color={colors.darkTeal} backgroundColor={colors.white} ecl="M" />
              </View>
            ) : (
              <Body muted>Your QR code will appear here before the event.</Body>
            )}
            <Text style={{ fontFamily: fonts.headline, fontSize: 22, color: colors.darkTeal, textAlign: 'center' }}>
              {guest.name ?? ''}
            </Text>
            <Body muted style={{ textAlign: 'center' }}>
              The QR code in your Luma confirmation email works too.
            </Body>
          </Card>

          <Card style={{ gap: space.md }}>
            <Subhead>{active.length === 1 ? 'Your ticket' : `Your tickets (${active.length})`}</Subhead>
            {active.length === 0 ? <Body muted>No active tickets.</Body> : null}
            {active.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
                <Body style={{ flex: 1, fontFamily: fonts.bold }}>{t.typeName}</Body>
                {!t.admitsEntry ? (
                  <Badge label="Add-on" tone="muted" />
                ) : t.checkedInAt ? (
                  <Badge label={`In · ${when(t.checkedInAt)}`} />
                ) : (
                  <Badge label="Not checked in" tone="muted" />
                )}
              </View>
            ))}
          </Card>

          <Card style={{ gap: space.md }}>
            <Subhead>Your perks</Subhead>
            {perks.length === 0 ? <Body muted>Your ticket doesn't include perks for this event.</Body> : null}
            {perks.map((p) => (
              <View
                key={p.perkId}
                accessible
                accessibilityLabel={`${p.name}: ${p.remaining} of ${p.allowance} left`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
              >
                <View style={{ flex: 1 }}>
                  <Body style={{ fontFamily: fonts.bold }}>{p.name}</Body>
                  {p.window === 'not_yet' && p.validFrom ? <Body muted>Available from {when(p.validFrom)}</Body> : null}
                  {p.window === 'ended' ? <Body muted>No longer available</Body> : null}
                  {p.window === 'open' && p.validUntil ? <Body muted>Until {when(p.validUntil)}</Body> : null}
                </View>
                <Text
                  style={{
                    fontFamily: fonts.headline,
                    fontSize: 22,
                    color: p.remaining > 0 && p.window === 'open' ? colors.orange : colors.muted,
                  }}
                >
                  {p.remaining}/{p.allowance}
                </Text>
              </View>
            ))}
            {perks.length > 0 ? <Body muted>Show your QR code to staff to redeem a perk.</Body> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

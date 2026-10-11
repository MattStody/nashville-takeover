import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from '@/theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.orange} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Headline: stands in for Norsh (uppercase display). */
export function Headline({ style, ...props }: TextProps) {
  return <Text accessibilityRole="header" style={[styles.headline, style]} {...props} />;
}

/** Subheading: Gotham Bold uppercase in orange per the guidelines. */
export function Subhead({ style, ...props }: TextProps) {
  return <Text accessibilityRole="header" style={[styles.subhead, style]} {...props} />;
}

export function Body({ style, muted, ...props }: TextProps & { muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }, style]} {...props} />;
}

export function Button({
  label,
  variant = 'primary',
  loading,
  style,
  ...props
}: PressableProps & { label: string; variant?: 'primary' | 'secondary' | 'ghost'; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const disabled = props.disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.teal },
        variant === 'secondary' && { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.teal },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.teal} />
      ) : (
        <Text style={[styles.buttonText, variant !== 'primary' && { color: colors.teal }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'teal' }: { label: string; tone?: 'teal' | 'orange' | 'muted' }) {
  const bg = tone === 'teal' ? colors.teal : tone === 'orange' ? colors.orange : colors.creamDeep;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, tone === 'muted' && { color: colors.darkTeal }]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.orange} />
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xxl }}>
      <Subhead style={{ textAlign: 'center' }}>{title}</Subhead>
      {message ? (
        <Body muted style={{ textAlign: 'center' }}>
          {message}
        </Body>
      ) : null}
      {action}
    </Card>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = /network|fetch/i.test(String((error as Error)?.message ?? error));
  return (
    <EmptyState
      title={offline ? "You're offline" : 'Something went wrong'}
      message={offline ? 'Check your connection and try again.' : 'Pull down to try again.'}
      action={onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  headline: {
    fontFamily: fonts.headline,
    fontSize: 30,
    lineHeight: 34,
    color: colors.darkTeal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subhead: {
    fontFamily: fonts.bold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.orange,
    textTransform: 'uppercase',
  },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.darkTeal },
  button: {
    minHeight: 52,
    borderRadius: radius.sm,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.white,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, color: colors.white, textTransform: 'uppercase' },
});

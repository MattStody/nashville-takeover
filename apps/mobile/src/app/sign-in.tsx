import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Body, Button, Card, Screen, Subhead } from '@/components/ui';
import { normalizeCode, normalizeEmail } from '@/lib/logic';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, space } from '@/theme';

const logo = require('../../assets/logo.png');

function friendly(message: string): string {
  if (/rate limit/i.test(message)) return 'Too many codes were requested recently. Please wait a while and try again.';
  if (/expired|invalid/i.test(message)) return 'That code is wrong or has expired. Check it, or send a new one.';
  if (/network|fetch/i.test(message)) return "You're offline. Check your connection and try again.";
  return 'Something went wrong. Please try again.';
}

export default function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const normalized = normalizeEmail(email);
    if (!normalized) return setError('Enter the email you used to buy your ticket.');
    setBusy(true);
    setError(null);
    // Sends a sign-in code to the address the person typed. Nothing else is emailed.
    const { error: e } = await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) return setError(friendly(e.message));
    setEmail(normalized);
    setStep('code');
  };

  const verify = async () => {
    const token = normalizeCode(code);
    if (!token) return setError('Enter the code from the email.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (e) setError(friendly(e.message));
    // On success the auth listener swaps to the app.
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: space.xxl, gap: space.md }}>
          <Image
            source={logo}
            style={{ width: '90%', maxWidth: 360, aspectRatio: 1500 / 888 }}
            contentFit="contain"
            accessibilityRole="image"
            accessibilityLabel="The Nashville Takeover"
          />
        </View>
        <Card style={{ gap: space.md }}>
          {step === 'email' ? (
            <>
              <Subhead>Sign in</Subhead>
              <Body>Use the email from your ticket. We'll send you a code.</Body>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={sendCode}
                accessibilityLabel="Email"
                style={inputStyle}
              />
              <Button label="Send code" onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <Subhead>Check your email</Subhead>
              <Body>Enter the code we sent to {email}.</Body>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={12}
                returnKeyType="done"
                onSubmitEditing={verify}
                accessibilityLabel="Sign-in code"
                style={[inputStyle, { fontSize: 24, letterSpacing: 6, textAlign: 'center' }]}
              />
              <Button label="Sign in" onPress={verify} loading={busy} />
              <Button
                label="Use a different email"
                variant="ghost"
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
              />
            </>
          )}
          {error ? (
            <Body accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
              {error}
            </Body>
          ) : null}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  minHeight: 52,
  borderWidth: 2,
  borderColor: colors.line,
  borderRadius: radius.sm,
  paddingHorizontal: space.md,
  fontFamily: fonts.medium,
  fontSize: 17,
  color: colors.darkTeal,
  backgroundColor: colors.white,
};

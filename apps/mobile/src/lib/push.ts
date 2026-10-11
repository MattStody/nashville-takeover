import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const TOKEN_KEY = 'nt.pushToken';

/**
 * Asks for notification permission and saves this device's Expo push token
 * against the signed-in user. Registration only: nothing in the platform
 * sends to it until guest contact is enabled for launch.
 *
 * Quietly skipped on web, simulators, and builds without an EAS project id.
 */
export async function registerForPush(): Promise<'registered' | 'denied' | 'unavailable'> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return 'unavailable';

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Event updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) return 'unavailable';
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'unavailable';
  }
}

/** Removes this device's token on sign-out so the next person doesn't get the last one's alerts. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Best effort; the next sign-in on this device reassigns the token anyway.
  }
}

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useHousehold } from '@/hooks/use-household';
import { useTheme } from '@/hooks/use-theme';

/**
 * Session exists but membership is missing after retries.
 * Recovery is retry + sign-out only (no ensure RPC — F-01).
 */
export default function BootstrapHouseholdScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const { refreshMembership } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRetry() {
    setBusy(true);
    setMessage(null);
    try {
      const membership = await refreshMembership();
      if (!membership) {
        setMessage('Still no household membership. Try again or sign out.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage(null);
    const { error } = await signOut();
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Setting up your household</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          Your account is signed in, but a household membership has not appeared yet. Retry, or
          sign out and try again later.
        </ThemedText>

        {message ? (
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handleRetry()}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundSelected, opacity: pressed || busy ? 0.7 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <ThemedText type="smallBold">Retry</ThemedText>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.backgroundElement, opacity: pressed || busy ? 0.7 : 1 },
            ]}>
            <ThemedText type="smallBold">Sign out</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  body: {
    lineHeight: 20,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});

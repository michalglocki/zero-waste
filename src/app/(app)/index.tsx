import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InviteCodeCard } from '@/components/household/invite-code-card';
import { JoinHouseholdForm } from '@/components/household/join-household-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useHousehold } from '@/hooks/use-household';
import { useTheme } from '@/hooks/use-theme';
import { getInviteCode } from '@/services/household';

export default function HouseholdHomeScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const { membership } = useHousehold();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(true);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    const householdId = membership?.household_id;
    let cancelled = false;

    void (async () => {
      if (!householdId) {
        if (!cancelled) {
          setInviteCode(null);
          setCodeError(null);
          setLoadingCode(false);
        }
        return;
      }

      if (!cancelled) {
        setLoadingCode(true);
        setCodeError(null);
      }

      try {
        const code = await getInviteCode(householdId);
        if (!cancelled) {
          setInviteCode(code);
          if (!code) {
            setCodeError('Could not load invite code.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setInviteCode(null);
          setCodeError(err instanceof Error ? err.message : 'Could not load invite code.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCode(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [membership?.household_id]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Household</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {"You're in a shared household. Share the invite code below, or join another household with theirs."}
          </ThemedText>

          <InviteCodeCard
            inviteCode={inviteCode}
            householdId={membership?.household_id ?? null}
            loading={loadingCode}
          />

          {codeError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {codeError}
            </ThemedText>
          ) : null}

          <JoinHouseholdForm />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void signOut()}
            style={({ pressed }) => [
              styles.signOut,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="smallBold">Sign out</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  signOut: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
  },
});

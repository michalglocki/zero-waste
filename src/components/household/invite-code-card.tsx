import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type InviteCodeCardProps = {
  inviteCode: string | null;
  householdId: string | null;
  loading?: boolean;
};

export function InviteCodeCard({ inviteCode, householdId, loading }: InviteCodeCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">Your household</ThemedText>
      {loading ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <>
          <ThemedText type="code" style={styles.code}>
            {inviteCode ?? '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Share this invite code so another adult can join.
          </ThemedText>
          {householdId ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.id}>
              id {householdId}
            </ThemedText>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
  },
  code: {
    fontSize: 28,
    letterSpacing: 2,
  },
  id: {
    fontFamily: undefined,
  },
});

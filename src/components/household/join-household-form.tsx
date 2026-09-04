import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHousehold } from '@/hooks/use-household';
import { useTheme } from '@/hooks/use-theme';

async function confirmJoin(): Promise<boolean> {
  const message =
    'Joining another household leaves your current household. Continue?';

  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.confirm(message) : false;
  }

  return new Promise((resolve) => {
    Alert.alert('Join household', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Join', onPress: () => resolve(true) },
    ]);
  });
}

export function JoinHouseholdForm() {
  const theme = useTheme();
  const { joinByInviteCode } = useHousehold();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleJoin() {
    setError(null);
    setSuccess(null);

    const confirmed = await confirmJoin();
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      const { error: joinError } = await joinByInviteCode(code.trim());
      if (joinError) {
        setError(joinError.message);
        return;
      }
      setSuccess('Joined household.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">Join another household</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Enter an invite code. This leaves your current household.
      </ThemedText>

      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        placeholder="Invite code"
        placeholderTextColor={theme.textSecondary}
        value={code}
        onChangeText={setCode}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
          },
        ]}
      />

      {error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      ) : null}
      {success ? <ThemedText type="small">{success}</ThemedText> : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy || code.trim().length === 0}
        onPress={() => void handleJoin()}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: theme.backgroundSelected,
            opacity: pressed || busy || code.trim().length === 0 ? 0.6 : 1,
          },
        ]}>
        {busy ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <ThemedText type="smallBold">Join</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    letterSpacing: 1,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ConsumeEmptyStateProps = {
  kind: 'nothing-to-consume' | 'no-results';
};

/** Consume-tab empty copy — never offers Scan (adds stay on Stock). */
export function ConsumeEmptyState({ kind }: ConsumeEmptyStateProps) {
  if (kind === 'no-results') {
    return (
      <View style={styles.container}>
        <ThemedText type="smallBold">No matching stock</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          No barcodes or names start with that prefix. Try a different search.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">Nothing to consume</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your household stock is empty. Add items from the Stock tab (for example via Scan).
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
});

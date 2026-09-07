import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type StockEmptyStateProps = {
  /** True when the household has no stock rows at all (vs search miss). */
  kind: 'no-stock' | 'no-results';
};

/**
 * Empty stock / empty search copy.
 * Scan CTA omitted until Phase 3 wires the scan route (no dead link).
 */
export function StockEmptyState({ kind }: StockEmptyStateProps) {
  if (kind === 'no-results') {
    return (
      <View style={styles.container}>
        <ThemedText type="smallBold">No matching stock</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          No barcodes start with that prefix. Try a different search.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">No stock yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your household stock list is empty. Scan a barcode to add the first item.
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

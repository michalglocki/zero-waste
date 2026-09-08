import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StockEmptyStateProps = {
  /** True when the household has no stock rows at all (vs search miss). */
  kind: 'no-stock' | 'no-results';
};

/** Empty stock / empty search copy, with Scan CTA when there is no stock yet. */
export function StockEmptyState({ kind }: StockEmptyStateProps) {
  const theme = useTheme();

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
      <ThemedText type="smallBold">No stock yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your household stock list is empty. Open Scan to add the first item (barcode or
        No barcode?).
      </ThemedText>
      <Link href="/(app)/scan" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Scan to add stock"
          style={({ pressed }) => [
            styles.scanButton,
            {
              backgroundColor: theme.backgroundSelected,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="smallBold">Scan</ThemedText>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  scanButton: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    marginTop: Spacing.one,
  },
});

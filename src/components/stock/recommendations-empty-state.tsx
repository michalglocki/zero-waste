import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Recommendations-tab empty copy — no Scan CTA; distinct from Stock/Consume empties.
 * Covers: not enough removal history, none overdue, or all ignored.
 */
export function RecommendationsEmptyState() {
  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">No recommendations right now</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Nothing looks nearly empty yet. Keep consuming from the Consume tab — after a few
        removals, products with quantity 1 that are overdue vs their usual interval show up
        here. Ignored items stay hidden until you add or remove that product again.
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

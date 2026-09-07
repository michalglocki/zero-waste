import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { StockItem } from '@/types/stock';

type StockListRowProps = {
  item: StockItem;
};

/** Primary label = barcode; quantity beside it (empty name until S-02). */
export function StockListRow({ item }: StockListRowProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="default" style={styles.barcode} numberOfLines={1}>
        {item.barcode}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.qty}>
        {item.quantity}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  barcode: {
    flex: 1,
  },
  qty: {
    minWidth: 32,
    textAlign: 'right',
  },
});

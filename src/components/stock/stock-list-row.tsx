import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { StockItem } from '@/types/stock';

type StockListRowProps = {
  item: StockItem;
};

function secondaryLine(item: StockItem): string | null {
  const parts = [item.main_category, item.pack_size].filter(
    (part): part is string => part != null && part.length > 0
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Primary label = name when set, else barcode; optional category/pack secondary. */
export function StockListRow({ item }: StockListRowProps) {
  const primary = item.name ?? item.barcode;
  const meta = secondaryLine(item);

  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <ThemedText type="default" numberOfLines={1}>
          {primary}
        </ThemedText>
        {meta ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {meta}
          </ThemedText>
        ) : null}
      </View>
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
  label: {
    flex: 1,
    gap: Spacing.half,
  },
  qty: {
    minWidth: 32,
    textAlign: 'right',
  },
});

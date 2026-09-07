import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StockItem } from '@/types/stock';

type StockListRowProps = {
  item: StockItem;
  /** When set, shows a − control (Consume tab only). */
  onRemove?: () => void;
  busy?: boolean;
  disabled?: boolean;
};

function secondaryLine(item: StockItem): string | null {
  const parts = [item.main_category, item.pack_size].filter(
    (part): part is string => part != null && part.length > 0
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Primary label = name when set, else barcode; optional category/pack secondary. */
export function StockListRow({
  item,
  onRemove,
  busy = false,
  disabled = false,
}: StockListRowProps) {
  const theme = useTheme();
  const primary = item.name ?? item.barcode;
  const meta = secondaryLine(item);
  const removeDisabled = disabled || busy || onRemove == null;

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
      {onRemove != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove one ${primary}`}
          accessibilityState={{ disabled: removeDisabled, busy }}
          disabled={removeDisabled}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeButton,
            {
              backgroundColor: theme.backgroundElement,
              opacity: removeDisabled ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}>
          {busy ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <ThemedText type="smallBold">−</ThemedText>
          )}
        </Pressable>
      ) : null}
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
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    borderRadius: Spacing.two,
  },
});

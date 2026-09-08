import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StockEmptyState } from '@/components/stock/stock-empty-state';
import { StockListRow } from '@/components/stock/stock-list-row';
import { StockSearchField } from '@/components/stock/stock-search-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listStockItems } from '@/services/stock';
import type { StockItem } from '@/types/stock';

export default function StockHomeScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<StockItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void (async () => {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        try {
          const rows = await listStockItems();
          if (!cancelled) {
            setItems(rows);
          }
        } catch (err) {
          if (!cancelled) {
            setItems([]);
            setError(err instanceof Error ? err.message : 'Could not load stock.');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const prefix = query.trim().toLowerCase();
  const filtered =
    prefix === ''
      ? items
      : items.filter((item) => {
          const barcode = (item.barcode ?? '').toLowerCase();
          const name = (item.name ?? '').toLowerCase();
          return barcode.startsWith(prefix) || name.startsWith(prefix);
        });

  const showSearchEmpty = query.trim() !== '' && filtered.length === 0 && !loading;
  const showNoStock = query.trim() === '' && items.length === 0 && !loading && !error;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.headerRow}>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Stock
          </ThemedText>
          <Link href="/(app)/scan" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan barcode"
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

        <StockSearchField value={query} onChangeText={setQuery} />

        {error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}

        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : showNoStock ? (
          <StockEmptyState kind="no-stock" />
        ) : showSearchEmpty ? (
          <StockEmptyState kind="no-results" />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <StockListRow item={item} />}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
            )}
            keyboardShouldPersistTaps="handled"
          />
        )}
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerTitle: {
    flex: 1,
  },
  scanButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  loader: {
    marginTop: Spacing.four,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});

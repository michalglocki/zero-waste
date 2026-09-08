import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConsumeEmptyState } from '@/components/stock/consume-empty-state';
import { StockListRow } from '@/components/stock/stock-list-row';
import { StockSearchField } from '@/components/stock/stock-search-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  listStockItems,
  removeStockById,
  STOCK_NOT_IN_STOCK_MESSAGE,
} from '@/services/stock';
import type { StockItem } from '@/types/stock';

async function confirmLastUnit(primaryLabel: string): Promise<boolean> {
  const message = `Remove the last unit of ${primaryLabel}? It will leave the list.`;

  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.confirm(message) : false;
  }

  return new Promise((resolve) => {
    Alert.alert('Remove last unit', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

type ActionError = {
  message: string;
  retryable: boolean;
  id: string | null;
};

function matchesStockPrefix(item: StockItem, prefix: string): boolean {
  const barcode = (item.barcode ?? '').toLowerCase();
  const name = (item.name ?? '').toLowerCase();
  return barcode.startsWith(prefix) || name.startsWith(prefix);
}

export default function ConsumeScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<StockItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyIdRef = useRef<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const lockBusy = useCallback((id: string) => {
    busyIdRef.current = id;
    setBusyId(id);
  }, []);

  const unlockBusy = useCallback(() => {
    busyIdRef.current = null;
    setBusyId(null);
  }, []);

  const refetchList = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoading(true);
    }
    setListError(null);
    try {
      const rows = await listStockItems();
      setItems(rows);
    } catch (err) {
      setItems([]);
      setListError(err instanceof Error ? err.message : 'Could not load stock.');
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void (async () => {
        if (!cancelled) {
          setLoading(true);
          setListError(null);
          setActionError(null);
        }

        try {
          const rows = await listStockItems();
          if (!cancelled) {
            setItems(rows);
          }
        } catch (err) {
          if (!cancelled) {
            setItems([]);
            setListError(err instanceof Error ? err.message : 'Could not load stock.');
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

  const applyRemove = useCallback(
    async (id: string) => {
      setActionError(null);

      try {
        const result = await removeStockById(id);
        if (result.deleted) {
          setItems((prev) => prev.filter((row) => row.id !== id));
        } else {
          setItems((prev) =>
            prev.map((row) => (row.id === id ? result.item : row))
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not remove item.';
        if (message === STOCK_NOT_IN_STOCK_MESSAGE) {
          setActionError({
            message: 'Not in stock',
            retryable: false,
            id: null,
          });
          await refetchList({ quiet: true });
          return;
        }
        setActionError({
          message,
          retryable: true,
          id,
        });
      } finally {
        unlockBusy();
      }
    },
    [refetchList, unlockBusy]
  );

  const handleRemove = useCallback(
    async (item: StockItem) => {
      if (busyIdRef.current != null) {
        return;
      }

      const id = item.id;
      lockBusy(id);

      if (item.quantity === 1) {
        const primary = item.name ?? item.barcode ?? 'Untitled';
        const confirmed = await confirmLastUnit(primary);
        if (!confirmed) {
          unlockBusy();
          return;
        }
        if (busyIdRef.current !== id) {
          return;
        }
      }

      await applyRemove(id);
    },
    [applyRemove, lockBusy, unlockBusy]
  );

  const prefix = query.trim().toLowerCase();
  const filtered =
    prefix === '' ? items : items.filter((item) => matchesStockPrefix(item, prefix));

  const showSearchEmpty = query.trim() !== '' && filtered.length === 0 && !loading;
  const showNothing =
    query.trim() === '' && items.length === 0 && !loading && !listError;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedText type="subtitle">Consume</ThemedText>

        <StockSearchField value={query} onChangeText={setQuery} />

        {listError ? (
          <ThemedText type="small" themeColor="textSecondary">
            {listError}
          </ThemedText>
        ) : null}

        {actionError ? (
          <View style={styles.actionErrorRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.actionErrorText}>
              {actionError.message}
            </ThemedText>
            {actionError.retryable && actionError.id != null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry remove"
                disabled={busyId != null}
                onPress={() => {
                  const id = actionError.id;
                  if (id == null || busyIdRef.current != null) {
                    return;
                  }
                  lockBusy(id);
                  void applyRemove(id);
                }}
                style={({ pressed }) => [
                  styles.retryButton,
                  {
                    backgroundColor: theme.backgroundSelected,
                    opacity: busyId != null ? 0.45 : pressed ? 0.7 : 1,
                  },
                ]}>
                <ThemedText type="smallBold">Retry</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : showNothing ? (
          <ConsumeEmptyState kind="nothing-to-consume" />
        ) : showSearchEmpty ? (
          <ConsumeEmptyState kind="no-results" />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <StockListRow
                item={item}
                onRemove={() => {
                  void handleRemove(item);
                }}
                busy={busyId === item.id}
                disabled={busyId != null}
              />
            )}
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
  actionErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionErrorText: {
    flex: 1,
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});

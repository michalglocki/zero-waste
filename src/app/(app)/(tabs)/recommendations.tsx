import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecommendationsEmptyState } from '@/components/stock/recommendations-empty-state';
import { StockListRow } from '@/components/stock/stock-list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ignoreRecommendation,
  listLikelyEmptyRecommendations,
  STOCK_NOT_IN_STOCK_MESSAGE,
} from '@/services/stock';
import type { StockItem } from '@/types/stock';

type ActionError = {
  message: string;
  retryable: boolean;
  id: string | null;
};

export default function RecommendationsScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<StockItem[]>([]);
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
      const rows = await listLikelyEmptyRecommendations();
      setItems(rows);
    } catch (err) {
      setItems([]);
      setListError(
        err instanceof Error ? err.message : 'Could not load recommendations.'
      );
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
          const rows = await listLikelyEmptyRecommendations();
          if (!cancelled) {
            setItems(rows);
          }
        } catch (err) {
          if (!cancelled) {
            setItems([]);
            setListError(
              err instanceof Error ? err.message : 'Could not load recommendations.'
            );
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

  const applyIgnore = useCallback(
    async (id: string) => {
      setActionError(null);

      try {
        await ignoreRecommendation(id);
        setItems((prev) => prev.filter((row) => row.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not ignore item.';
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

  const handleIgnore = useCallback(
    (item: StockItem) => {
      if (busyIdRef.current != null) {
        return;
      }

      const id = item.id;
      lockBusy(id);
      void applyIgnore(id);
    },
    [applyIgnore, lockBusy]
  );

  const showEmpty = items.length === 0 && !loading && !listError;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ThemedText type="subtitle">Recommendations</ThemedText>

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
                accessibilityLabel="Retry ignore"
                disabled={busyId != null}
                onPress={() => {
                  const id = actionError.id;
                  if (id == null || busyIdRef.current != null) {
                    return;
                  }
                  lockBusy(id);
                  void applyIgnore(id);
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
        ) : showEmpty ? (
          <RecommendationsEmptyState />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <StockListRow
                item={item}
                onIgnore={() => {
                  handleIgnore(item);
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

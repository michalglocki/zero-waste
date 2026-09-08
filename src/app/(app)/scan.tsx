import { Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { StockCameraScanner } from '@/components/stock/stock-camera-scanner';
import { StockConfirmSheet } from '@/components/stock/stock-confirm-sheet';
import { StockManualAddSheet } from '@/components/stock/stock-manual-add-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Scan → confirm → upsert. Stays on this screen after success, re-armed for the next code.
 * Camera via platform `StockCameraScanner` (native only); typed barcode on all platforms.
 * "No barcode?" opens a dedicated manual form (name required when code absent).
 */
export default function ScanScreen() {
  const theme = useTheme();
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [typedBarcode, setTypedBarcode] = useState('');
  const [manualOpen, setManualOpen] = useState(false);

  const confirmOpen = pendingBarcode !== null;
  const anySheetOpen = confirmOpen || manualOpen;

  function openConfirm(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return;
    }
    setPendingBarcode(trimmed);
  }

  function handleConfirmSuccess() {
    setPendingBarcode(null);
    setTypedBarcode('');
  }

  function handleConfirmDismiss() {
    setPendingBarcode(null);
  }

  function handleManualSuccess() {
    setManualOpen(false);
  }

  function handleManualDismiss() {
    setManualOpen(false);
  }

  function handleHandOffToConfirm(barcode: string) {
    setManualOpen(false);
    openConfirm(barcode);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <ThemedText type="small" themeColor="textSecondary">
          {Platform.OS === 'web'
            ? 'Type a product barcode to add it, or use No barcode? for produce and bulk. Camera scanning is available in the native app. After confirm you stay here for the next item.'
            : 'Scan a product barcode, type a code below, or use No barcode? for produce and bulk. After confirm you stay here for the next item.'}
        </ThemedText>

        <StockCameraScanner
          paused={anySheetOpen}
          onBarcodeScanned={(data) => {
            if (!anySheetOpen) {
              openConfirm(data);
            }
          }}
        />

        <ThemedText type="smallBold">
          {Platform.OS === 'web' ? 'Type a barcode' : 'Or type a barcode'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Continue uses a typed barcode. For items without a code, use No barcode? below.
        </ThemedText>

        <TextInput
          accessibilityLabel="Barcode"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!anySheetOpen}
          placeholder="Barcode (leading zeros kept)"
          placeholderTextColor={theme.textSecondary}
          value={typedBarcode}
          onChangeText={setTypedBarcode}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.backgroundSelected,
            },
          ]}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use typed barcode"
          disabled={anySheetOpen || typedBarcode.trim() === ''}
          onPress={() => openConfirm(typedBarcode)}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.backgroundSelected,
              opacity:
                pressed || anySheetOpen || typedBarcode.trim() === '' ? 0.6 : 1,
            },
          ]}>
          <ThemedText type="smallBold">Continue</ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add without barcode"
          disabled={anySheetOpen}
          onPress={() => setManualOpen(true)}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.backgroundElement,
              opacity: pressed || anySheetOpen ? 0.6 : 1,
            },
          ]}>
          <ThemedText type="smallBold">No barcode?</ThemedText>
        </Pressable>
      </SafeAreaView>

      {manualOpen ? (
        <StockManualAddSheet
          onDismiss={handleManualDismiss}
          onSuccess={handleManualSuccess}
          onHandOffToConfirm={handleHandOffToConfirm}
        />
      ) : null}

      {pendingBarcode ? (
        <StockConfirmSheet
          key={pendingBarcode}
          barcode={pendingBarcode}
          onDismiss={handleConfirmDismiss}
          onSuccess={handleConfirmSuccess}
        />
      ) : null}
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
    paddingBottom: BottomTabInset + Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});

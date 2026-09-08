import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { parseAddDelta } from '@/components/stock/stock-confirm-sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addStockManualNoBarcode } from '@/services/stock';

type StockManualAddSheetProps = {
  onDismiss: () => void;
  /** Called after a successful no-code add (stay on Scan). */
  onSuccess: () => void;
  /**
   * Barcode filled → close this sheet and open confirm with that code only.
   * Form name (and delta) are discarded; confirm owns identity + quantity.
   */
  onHandOffToConfirm: (barcode: string) => void;
};

/**
 * Manual add without a scanned code: optional barcode, required name when empty,
 * add-delta quantity. Nonempty barcode hands off to StockConfirmSheet.
 */
export function StockManualAddSheet({
  onDismiss,
  onSuccess,
  onHandOffToConfirm,
}: StockManualAddSheetProps) {
  const theme = useTheme();
  const [barcodeText, setBarcodeText] = useState('');
  const [nameText, setNameText] = useState('');
  const [deltaText, setDeltaText] = useState('1');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const barcodeTrimmed = barcodeText.trim();
  const hasBarcode = barcodeTrimmed !== '';
  const delta = parseAddDelta(deltaText);
  const nameDisabled = hasBarcode || busy;

  function adjustDelta(step: number) {
    const next = Math.max(0, delta + step);
    setDeltaText(String(next));
  }

  async function handleSubmit() {
    if (busy) {
      return;
    }

    setFieldError(null);
    setSaveError(null);

    if (hasBarcode) {
      // Discard name + form delta; confirm sheet owns the add.
      onHandOffToConfirm(barcodeTrimmed);
      return;
    }

    const nameTrimmed = nameText.trim();
    if (nameTrimmed === '') {
      setFieldError('Name is required when there is no barcode.');
      return;
    }
    if (delta < 1) {
      setFieldError('Amount to add must be at least 1.');
      return;
    }

    setBusy(true);
    try {
      await addStockManualNoBarcode(nameTrimmed, delta);
      onSuccess();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const primaryLabel = saveError ? 'Retry' : hasBarcode ? 'Continue' : 'Add';
  const submitDisabled = busy;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) {
          onDismiss();
        }
      }}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          ]}>
          <ThemedText type="smallBold">Add without barcode</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Enter a name and quantity, or fill a barcode to use the usual confirm flow.
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary">
            Barcode (optional)
          </ThemedText>
          <TextInput
            accessibilityLabel="Barcode optional"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="Leave empty for produce or bulk"
            placeholderTextColor={theme.textSecondary}
            value={barcodeText}
            onChangeText={(text) => {
              setBarcodeText(text);
              setFieldError(null);
              setSaveError(null);
            }}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          />

          <ThemedText type="small" themeColor="textSecondary">
            {hasBarcode
              ? 'Name (not used when barcode is filled)'
              : 'Name (required without a barcode)'}
          </ThemedText>
          <TextInput
            accessibilityLabel="Product name"
            accessibilityState={{ disabled: nameDisabled }}
            autoCapitalize="sentences"
            autoCorrect={false}
            editable={!nameDisabled}
            placeholder={hasBarcode ? 'Confirm will identify the product' : 'e.g. Apples'}
            placeholderTextColor={theme.textSecondary}
            value={hasBarcode ? '' : nameText}
            onChangeText={(text) => {
              setNameText(text);
              setFieldError(null);
              setSaveError(null);
            }}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
                opacity: nameDisabled ? 0.45 : 1,
              },
            ]}
          />

          {!hasBarcode ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Amount to add
              </ThemedText>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease amount"
                  disabled={busy}
                  onPress={() => adjustDelta(-1)}
                  style={({ pressed }) => [
                    styles.stepButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      opacity: pressed || busy ? 0.6 : 1,
                    },
                  ]}>
                  <ThemedText type="smallBold">−</ThemedText>
                </Pressable>

                <TextInput
                  accessibilityLabel="Amount to add"
                  editable={!busy}
                  keyboardType="number-pad"
                  value={deltaText}
                  onChangeText={(text) => {
                    setDeltaText(text);
                    setFieldError(null);
                    setSaveError(null);
                  }}
                  style={[
                    styles.deltaInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.backgroundSelected,
                    },
                  ]}
                />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase amount"
                  disabled={busy}
                  onPress={() => adjustDelta(1)}
                  style={({ pressed }) => [
                    styles.stepButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      opacity: pressed || busy ? 0.6 : 1,
                    },
                  ]}>
                  <ThemedText type="smallBold">+</ThemedText>
                </Pressable>
              </View>
            </>
          ) : null}

          {fieldError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {fieldError}
            </ThemedText>
          ) : null}

          {saveError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {saveError}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={busy}
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed || busy ? 0.6 : 1,
                },
              ]}>
              <ThemedText type="smallBold">Cancel</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              disabled={submitDisabled}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundSelected,
                  opacity: pressed || submitDisabled ? 0.6 : 1,
                },
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <ThemedText type="smallBold">{primaryLabel}</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    minHeight: 44,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
  },
  deltaInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    textAlign: 'center',
    minHeight: 44,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});

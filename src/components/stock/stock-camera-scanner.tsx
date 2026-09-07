import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Prefer grocery 1D codes; other types still scan if the device reports them. */
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

type StockCameraScannerProps = {
  /** When true, pause onBarcodeScanned so one code does not spam sheets. */
  paused: boolean;
  onBarcodeScanned: (data: string) => void;
  /** Optional block shown when permission is missing (above typed fallback). */
  children?: ReactNode;
};

/**
 * Native camera barcode capture. Web uses `stock-camera-scanner.web.tsx` (no expo-camera).
 */
export function StockCameraScanner({
  paused,
  onBarcodeScanned,
}: StockCameraScannerProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, [])
  );

  if (!permission) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Checking camera permission…
      </ThemedText>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBlock}>
        <ThemedText type="small" themeColor="textSecondary">
          Camera access is needed to scan barcodes. You can allow the camera, open system settings,
          or type the code instead.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Allow camera"
          onPress={() => void requestPermission()}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.backgroundSelected,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="smallBold">Allow camera</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={() => void Linking.openSettings()}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.backgroundElement,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="smallBold">Open settings</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (!isFocused) {
    return null;
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                onBarcodeScanned(data);
              }
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  permissionBlock: {
    gap: Spacing.two,
  },
  cameraWrap: {
    alignSelf: 'stretch',
    height: 280,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});

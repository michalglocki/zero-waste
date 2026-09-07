import type { ReactNode } from 'react';

type StockCameraScannerProps = {
  paused: boolean;
  onBarcodeScanned: (data: string) => void;
  children?: ReactNode;
};

/**
 * Web stub: no expo-camera (avoids barcode-detector/zxing Metro ponyfill resolution failure).
 * Typed barcode on the scan screen is the web path for S-01.
 */
export function StockCameraScanner(_props: StockCameraScannerProps) {
  return null;
}

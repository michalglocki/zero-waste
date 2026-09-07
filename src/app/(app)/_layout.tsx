import { Stack } from 'expo-router';

/**
 * Native: Stack over tabs so Scan/Join can push above the tab bar.
 * NativeTabs alone only mounts Trigger routes — sibling `scan` was unreachable.
 */
export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ title: 'Scan', headerBackTitle: 'Stock' }} />
      <Stack.Screen name="join" options={{ title: 'Join household' }} />
    </Stack>
  );
}

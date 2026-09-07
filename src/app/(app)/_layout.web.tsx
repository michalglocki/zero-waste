import { Stack } from 'expo-router';
import Head from 'expo-router/head';

/**
 * Web app shell: Stack hosts tabs group + Scan/Join.
 * Stock ↔ Household chrome lives in `(tabs)/_layout.web.tsx`.
 */
export default function AppLayout() {
  return (
    <>
      <Head>
        <title>Zero waste</title>
      </Head>
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: 'Scan' }} />
        <Stack.Screen name="join" options={{ title: 'Join household' }} />
      </Stack>
    </>
  );
}

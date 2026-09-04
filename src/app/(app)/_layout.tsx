import AppTabs from '@/components/app-tabs';

/** Native: system tabs. Web uses `_layout.web.tsx` (Stack) — headless Tabs hrefs were resolving to +not-found. */
export default function AppLayout() {
  return <AppTabs />;
}

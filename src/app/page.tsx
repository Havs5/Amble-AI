import AmbleApp from '@/components/AmbleApp';

// The app shell must NOT be statically cached: it was being served with
// `Cache-Control: s-maxage=31536000` (1 year), so the CDN kept serving stale
// HTML that referenced old JS chunks and new deploys never reached users.
// force-dynamic makes Next emit no-store, so every deploy is live immediately.
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <AmbleApp />
  );
}

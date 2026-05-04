'use client';

import dynamic from 'next/dynamic';

// ssr: false must be declared from a Client Component (Next.js 16 requirement).
// LabelVerifier uses useState/useEffect and is purely client-side interactive —
// skipping SSR eliminates hydration mismatches entirely.
const LabelVerifier = dynamic(() => import('./LabelVerifier'), { ssr: false });

export default function LabelVerifierLoader() {
  return <LabelVerifier />;
}

'use client';

import { Button } from '@tadpods/ui';

export default function TransfersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="empty-state" role="alert">
    <strong>Transfers could not be loaded.</strong>
    <p>Something went wrong while loading this page. Try again, or come back later.</p>
    <Button variant="secondary" onClick={reset}>Try again</Button>
  </div>;
}

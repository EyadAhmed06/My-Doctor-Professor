"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageSkeleton } from "./async-state";
import { ProductShell } from "./product-shell";

export function ConnectedSubscriptionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/bundles");
  }, [router]);

  return (
    <ProductShell>
      <main className="pp-page">
        <PageSkeleton variant="cards" label="Opening bundles" />
      </main>
    </ProductShell>
  );
}

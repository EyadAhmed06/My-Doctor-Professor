"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Paid bundles must enter the payment-method selection flow before any paid
 * enrollment is created. The existing bundle card owns the visual button; this
 * bridge intercepts that paid-only action at capture time so the old enrollment
 * handler cannot run while payment integration is intentionally not live yet.
 */
export function PaidBundleCheckoutBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/bundles") return;

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button.pp-button") : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const label = target.textContent?.trim() || "";
      if (!label.startsWith("Subscribe for ")) return;

      const params = new URLSearchParams(window.location.search);
      const bundle = params.get("bundle") || params.get("id");
      if (!bundle) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      router.push(`/payment-methods?bundle=${encodeURIComponent(bundle)}`);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, router]);

  return null;
}

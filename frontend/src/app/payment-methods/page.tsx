import { PaymentMethodsClient } from "./payment-methods-client";

export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ bundle?: string | string[] }> }) {
  const params = await searchParams;
  const raw = params.bundle;
  const bundleRef = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  return <PaymentMethodsClient bundleRef={bundleRef} />;
}

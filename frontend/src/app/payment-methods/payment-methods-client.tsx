"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheck, FiCreditCard, FiLock } from "react-icons/fi";
import { useAuth } from "@/components/auth-provider";
import "./payment-methods.css";

type Bundle = {
  id: string;
  slug: string;
  title: string;
  isFree: boolean;
  priceAmount: string | null;
  priceCurrency: string;
};

type PaymentMethod = "FAWRY" | "INSTAPAY" | "TELDA" | "CARD";

const METHODS: Array<{ id: PaymentMethod; label: string; detail: string; mark: string }> = [
  { id: "FAWRY", label: "Fawry", detail: "Pay through Fawry when integration becomes available.", mark: "F" },
  { id: "INSTAPAY", label: "InstaPay", detail: "Pay using InstaPay when integration becomes available.", mark: "IP" },
  { id: "TELDA", label: "Telda", detail: "Pay with Telda when integration becomes available.", mark: "T" },
  { id: "CARD", label: "Visa / Mastercard", detail: "Card payments will use a hosted PCI-compliant checkout.", mark: "V/M" },
];

export function PaymentMethodsClient({ bundleRef }: { bundleRef: string | null }) {
  const { request } = useAuth();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void request<Bundle[]>("/catalog/bundles")
      .then((rows) => { if (active) setBundles(Array.isArray(rows) ? rows : []); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load bundle payment details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request]);

  const bundle = useMemo(() => bundles.find((item) => item.id === bundleRef || item.slug === bundleRef) || null, [bundleRef, bundles]);
  const price = bundle ? `${bundle.priceCurrency} ${Number(bundle.priceAmount || 0).toFixed(2)}` : "";

  return <main className="payment-methods-page">
    <section className="payment-methods-shell">
      <Link className="payment-back" href={bundleRef ? `/bundles?bundle=${encodeURIComponent(bundleRef)}` : "/bundles"}><FiArrowLeft /> Back to bundle</Link>
      <header>
        <span className="payment-eyebrow">SECURE CHECKOUT</span>
        <h1>Choose a payment method</h1>
        <p>Select how you want to pay. No payment will be submitted until a real provider integration is enabled.</p>
      </header>

      {loading ? <div className="payment-state">Loading payment options…</div> : error ? <div className="payment-state error">{error}</div> : !bundle ? <div className="payment-state error">This bundle could not be found.</div> : <>
        <section className="payment-summary">
          <div><small>Bundle</small><strong>{bundle.title}</strong></div>
          <div><small>Total</small><strong>{price}</strong></div>
        </section>

        <fieldset className="payment-method-list">
          <legend>Payment methods</legend>
          {METHODS.map((method) => <label className={`payment-method ${selected === method.id ? "selected" : ""}`} key={method.id}>
            <input type="radio" name="payment-method" value={method.id} checked={selected === method.id} onChange={() => setSelected(method.id)} />
            <span className="payment-method-mark" aria-hidden="true">{method.mark}</span>
            <span className="payment-method-copy"><strong>{method.label}</strong><small>{method.detail}</small></span>
            <span className="payment-radio-visual">{selected === method.id ? <FiCheck /> : null}</span>
          </label>)}
        </fieldset>

        <div className="payment-security-note"><FiLock /><span>Card data will never be stored by My Doctor & The Professor. A hosted payment provider will handle sensitive card details.</span></div>
        <button className="payment-continue" type="button" disabled={!selected} aria-disabled="true"><FiCreditCard /> Payment integration coming soon</button>
      </>}
    </section>
  </main>;
}

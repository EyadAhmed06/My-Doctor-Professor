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

type Method = {
  id: PaymentMethod;
  label: string;
  logo?: string;
  logoClass?: string;
};

const METHODS: Method[] = [
  { id: "FAWRY", label: "Fawry", logo: "/media/payment-fawry.svg", logoClass: "fawry-logo" },
  { id: "INSTAPAY", label: "InstaPay", logo: "/media/payment-instapay.svg", logoClass: "instapay-logo" },
  { id: "TELDA", label: "Telda", logo: "/media/payment-telda.svg", logoClass: "telda-logo" },
  { id: "CARD", label: "Visa / Mastercard" },
];

export function PaymentMethodsClient({ bundleRef }: { bundleRef: string | null }) {
  const { request } = useAuth();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [handoffReady, setHandoffReady] = useState(false);
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
  const selectedMethod = METHODS.find((method) => method.id === selected) || null;

  async function continuePayment() {
    if (!bundle || !selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await request(`/subscriptions/bundles/${bundle.id}/purchase`, { method: "POST", body: {} });
      setHandoffReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare this payment right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="payment-methods-page">
    <section className="payment-methods-shell">
      <Link className="payment-back" href={bundleRef ? `/bundles?bundle=${encodeURIComponent(bundleRef)}` : "/bundles"}><FiArrowLeft /> Back to bundle</Link>
      <header>
        <span className="payment-eyebrow">SECURE CHECKOUT</span>
        <h1>{handoffReady ? "Payment request prepared" : "Choose a payment method"}</h1>
      </header>

      {loading ? <div className="payment-state">Loading payment options…</div> : error ? <div className="payment-state error">{error}</div> : !bundle ? <div className="payment-state error">This bundle could not be found.</div> : handoffReady && selectedMethod ? <section className="payment-handoff">
        <div className="payment-handoff-icon"><FiCheck /></div>
        <span className="payment-eyebrow">NEXT STEP</span>
        <h2>{selectedMethod.label} selected</h2>
        <p>Your enrollment is pending payment verification. The bundle remains locked until the selected provider confirms payment.</p>
        <div className="payment-handoff-actions">
          <Link className="payment-continue" href={`/bundles?bundle=${encodeURIComponent(bundle.id)}`}>Return to bundle</Link>
          <button className="payment-secondary" type="button" onClick={() => setHandoffReady(false)}>Choose another method</button>
        </div>
      </section> : <>
        <section className="payment-summary">
          <div><small>Bundle</small><strong>{bundle.title}</strong></div>
          <div><small>Total</small><strong>{price}</strong></div>
        </section>

        <fieldset className="payment-method-list">
          <legend>Payment methods</legend>
          {METHODS.map((method) => <label className={`payment-method ${selected === method.id ? "selected" : ""}`} key={method.id}>
            <input type="radio" name="payment-method" value={method.id} checked={selected === method.id} onChange={() => setSelected(method.id)} />
            <span className="payment-brand" aria-hidden="true">
              {method.logo ? <img className={method.logoClass} src={method.logo} alt="" /> : <span className="card-brand"><b>VISA</b><i><span/><span/></i></span>}
            </span>
            <strong className="payment-label">{method.label}</strong>
            <span className="payment-radio-visual">{selected === method.id ? <FiCheck /> : null}</span>
          </label>)}
        </fieldset>

        <div className="payment-security-note"><FiLock /><span>Payment details are handled securely by the selected provider.</span></div>
        <button className="payment-continue" type="button" disabled={!selected || submitting} aria-disabled={!selected || submitting} onClick={continuePayment}><FiCreditCard /> {submitting ? "Preparing…" : "Continue"}</button>
      </>}
    </section>
  </main>;
}

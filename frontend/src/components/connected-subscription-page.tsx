"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiClock, FiCreditCard } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import { PlanOptions, type PlanKey, type PlanTier } from "./advanced-bundles-page";
import "./product-pages.css";
import "./bundle-management.css";

type SubscriptionPlan = {
  id: string;
  key: "free" | "normal" | "first_5_weeks" | "last_5_weeks" | "max";
  label: string;
  priceAmount: string | null;
  priceCurrency: string;
};

const PLAN_DESCRIPTIONS: Record<SubscriptionPlan["key"], string> = {
  free: "Default plan on signup. Unlocks whichever bundles an instructor opts into the Free tier.",
  normal: "Standard paid tier. Unlocks whichever bundles an instructor opts into the Normal tier.",
  first_5_weeks: "Unlocks whichever bundles an instructor opts into the First 5 Weeks tier.",
  last_5_weeks: "Unlocks whichever bundles an instructor opts into the Last 5 Weeks tier.",
  max: "Unlocks every bundle on the platform, regardless of its allowed plans.",
};

type Bundle = {
  id: string;
  title: string;
  description: string | null;
  academicYear: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFree: boolean;
  priceAmount: string | null;
  priceCurrency: string;
  firstPlanEnabled?: boolean;
  firstPlanPriceMcq?: string | null;
  firstPlanPriceMcqEssay?: string | null;
  finalPlanEnabled?: boolean;
  finalPlanPriceMcq?: string | null;
  finalPlanPriceMcqEssay?: string | null;
  accessible?: boolean;
  payment_required?: boolean;
  partial_access?: boolean;
  access_status?: string;
};

function offersAnyPlan(bundle: Bundle) {
  return !bundle.isFree || bundle.firstPlanEnabled || bundle.finalPlanEnabled;
}

function ownershipBadge(bundle: Bundle) {
  if (bundle.access_status === undefined) return null;
  if (bundle.accessible && !bundle.partial_access) return { label: "Full access active", tone: "good" };
  if (bundle.partial_access) return { label: "Partial access active", tone: "partial" };
  if (bundle.payment_required) return { label: "Payment pending", tone: "pending" };
  return null;
}

export function ConnectedSubscriptionPage() {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [mine, setMine] = useState<Bundle[]>([]);
  const [catalog, setCatalog] = useState<Bundle[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

  const load = useCallback(async () => {
    if (user?.role !== "STUDENT") { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [owned, publicItems, allPlans, myPlan] = await Promise.all([
        request<Bundle[]>("/bundles/mine"),
        request<Bundle[]>("/catalog/bundles"),
        request<SubscriptionPlan[]>("/subscriptions/plans"),
        request<SubscriptionPlan>("/subscriptions/me"),
      ]);
      setMine(owned);
      setCatalog(publicItems.filter((item) => !owned.some((ownedItem) => ownedItem.id === item.id)));
      setPlans(allPlans);
      setCurrentPlanId(myPlan.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load subscription plans.");
    } finally {
      setLoading(false);
    }
  }, [request, user?.role]);

  useEffect(() => { void load(); }, [load]);

  const bundles = useMemo(() => [...mine, ...catalog].filter(offersAnyPlan), [mine, catalog]);

  async function changePlan(plan: SubscriptionPlan) {
    if (planBusy || plan.id === currentPlanId) return;
    setPlanBusy(true);
    try {
      await request("/subscriptions/me", { method: "PUT", body: { plan_id: plan.id } });
      notify({ title: "Plan switched", description: `You're now on the ${plan.label} plan.`, tone: "success" });
      await load();
    } catch (cause) {
      notify({ title: "Unable to switch plan", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setPlanBusy(false);
    }
  }

  async function enrollFull(bundle: Bundle) {
    if (busyId) return;
    setBusyId(bundle.id);
    try {
      await request(`/bundles/${bundle.id}/enroll`, { method: "POST" });
      notify({
        title: bundle.isFree ? "Bundle joined" : "Requested — payment required",
        description: bundle.isFree ? `${bundle.title} is now available in My Bundles.` : `Full access to "${bundle.title}" stays locked until payment is verified.`,
        tone: bundle.isFree ? "success" : "info",
      });
      await load();
    } catch (cause) {
      notify({ title: "Unable to request access", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function enrollPlan(bundle: Bundle, plan: PlanKey, tier: PlanTier) {
    if (busyId) return;
    setBusyId(bundle.id);
    try {
      await request(`/bundles/${bundle.id}/plans/${plan}/enroll`, { method: "POST", body: { tier } });
      notify({
        title: "Requested — payment required",
        description: `${plan === "FIRST" ? "First 5 Weeks" : "Final 5 Weeks"} access to "${bundle.title}" stays locked until payment is verified.`,
        tone: "info",
      });
      await load();
    } catch (cause) {
      notify({ title: "Unable to request access", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return <ProductShell search="Search bundles, courses, weeks, or lectures">
    <main className="pp-page bundle-page">
      <div className="pp-title hero">
        <div>
          <small className="page-eyebrow">SUBSCRIPTION PLANS</small>
          <h1>Subscription plans</h1>
          <p>Every paid bundle and plan available to you, with full pricing and coverage details.</p>
        </div>
      </div>

      {user?.role !== "STUDENT" ? (
        <Panel title="Student feature"><p>Subscription plans are purchased by student accounts. Manage pricing for a bundle from its management panel instead.</p></Panel>
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <PageSkeleton variant="cards" label="Loading subscription plans" />
      ) : (<>
        <div className="pp-title">
          <div>
            <h2>Platform plans</h2>
            <p>Your account plan. Bundles unlock automatically the moment you open one your plan covers — access is permanent even if you switch plans later.</p>
          </div>
        </div>
        <div className="subscription-plan-grid">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            return (
              <Panel key={plan.id} title={plan.label} className="subscription-plan-card">
                <div className="subscription-plan-meta">
                  <small>{plan.priceAmount ? `${plan.priceCurrency} ${Number(plan.priceAmount).toFixed(2)} / month` : "No extra charge"}</small>
                  {isCurrent && <em className="good"><FiCheckCircle /> Current plan</em>}
                </div>
                <p>{PLAN_DESCRIPTIONS[plan.key]}</p>
                {!isCurrent && (
                  <button className="pp-button" type="button" disabled={planBusy} onClick={() => void changePlan(plan)}>
                    {planBusy ? "Switching…" : "Switch to this plan"}
                  </button>
                )}
              </Panel>
            );
          })}
        </div>

        <div className="pp-title">
          <div>
            <h2>Bundle-specific plans</h2>
            <p>Partial-access plans an instructor has configured for one specific bundle (independent of your platform plan above).</p>
          </div>
        </div>
        {!bundles.length ? (
          <EmptyState title="No bundle-specific plans available yet" description="Free bundles unlock immediately from My Bundles. Check back once an instructor publishes a paid bundle or subscription plan." />
        ) : (
        <div className="subscription-plan-grid">
          {bundles.map((bundle) => {
            const badge = ownershipBadge(bundle);
            return (
              <Panel key={bundle.id} title={bundle.title} className="subscription-plan-card">
                <div className="subscription-plan-meta">
                  <small>YEAR {bundle.academicYear}</small>
                  {badge && <em className={badge.tone}>
                    {badge.tone === "good" ? <FiCheckCircle /> : badge.tone === "pending" ? <FiClock /> : <FiCreditCard />} {badge.label}
                  </em>}
                </div>
                <p>{bundle.description || "Published learning bundle."}</p>
                {badge?.tone === "good" ? (
                  <p className="bundle-plan-note">You already have full access to this bundle — open it from My Bundles.</p>
                ) : (
                  <PlanOptions
                    bundle={bundle}
                    busy={busyId === bundle.id}
                    onChooseFull={!bundle.isFree ? () => void enrollFull(bundle) : undefined}
                    onChoosePlan={(plan, tier) => void enrollPlan(bundle, plan, tier)}
                  />
                )}
                {bundle.isFree && !bundle.firstPlanEnabled && !bundle.finalPlanEnabled && !badge && (
                  <button className="pp-button" type="button" disabled={busyId === bundle.id} onClick={() => void enrollFull(bundle)}>Join free bundle</button>
                )}
              </Panel>
            );
          })}
        </div>
        )}
      </>)}
    </main>
  </ProductShell>;
}

"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiFileText,
  FiLayers,
  FiLock,
  FiPlus,
  FiRefreshCw,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./role-workspace.css";
import "./bundle-management.css";

type Bundle = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  academicYear: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFree: boolean;
  priceAmount?: string | null;
  priceCurrency?: string;
  firstPlanEnabled?: boolean;
  firstPlanPriceMcq?: string | null;
  firstPlanPriceMcqEssay?: string | null;
  finalPlanEnabled?: boolean;
  finalPlanPriceMcq?: string | null;
  finalPlanPriceMcqEssay?: string | null;
  read_only?: boolean;
  payment_required?: boolean;
  access_status?: "PENDING_PAYMENT" | "REVOKED" | "DRAFT" | "SCHEDULED" | "EXPIRED" | "ACTIVE" | "PARTIAL";
};


type Lecture = {
  id: string;
  title: string;
  lectureNumber: number;
  question_count: number;
  flashcard_deck_count: number;
  resource_count: number;
};

type Week = {
  id: string;
  weekNumber: number;
  title: string | null;
  lectures: Lecture[];
};

type Course = {
  id: string;
  courseCode: string;
  courseName: string;
  weeks: Week[];
};

type Exam = {
  id: string;
  title: string;
  durationMinutes: number | null;
};

type Content = {
  bundle: Bundle;
  courses: Course[];
  past_exams: Exam[];
  totals: {
    courses: number;
    weeks: number;
    lectures: number;
    questions: number;
    flashcard_decks: number;
    resources: number;
    past_exams: number;
  };
};

type Tab = "overview" | "curriculum" | "questions" | "exams" | "flashcards" | "resources";

const tabs: Tab[] = ["overview", "curriculum", "questions", "exams", "flashcards", "resources"];

function validTab(value: string | null): Tab {
  return tabs.includes(value as Tab) ? (value as Tab) : "overview";
}

export function ConnectedBundlesPage() {
  const { user, request } = useAuth();
  const { notify, startNavigation } = useUx();
  const manager = user?.role !== "STUDENT";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const requestedTab = validTab(searchParams.get("tab"));

  const [tab, setTab] = useState<Tab>(requestedTab);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [catalog, setCatalog] = useState<Bundle[]>([]);
  const [selected, setSelected] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [planPickerBundle, setPlanPickerBundle] = useState<Bundle | null>(null);

  const setUrl = useCallback(
    (bundleId: string | null, nextTab: Tab, replace = false) => {
      const params = new URLSearchParams(searchParams.toString());
      if (bundleId) params.set("id", bundleId);
      else params.delete("id");
      params.set("tab", nextTab);
      const href = `${pathname}?${params.toString()}`;
      startNavigation();
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router, searchParams, startNavigation],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const owned = await request<Bundle[]>(manager ? "/bundles/managed" : "/bundles/mine");
      setBundles(owned);
      if (!manager) {
        const publicItems = await request<Bundle[]>("/catalog/bundles");
        setCatalog(publicItems.filter((item) => !owned.some((ownedItem) => ownedItem.id === item.id)));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load bundles.");
    } finally {
      setLoading(false);
    }
  }, [manager, request]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (!bundles.length) {
      setSelected(null);
      return;
    }

    const stored = (() => {
      try {
        return localStorage.getItem(`mdp:last-bundle:${user?.id || "anonymous"}`);
      } catch {
        return null;
      }
    })();

    const target =
      bundles.find((item) => item.id === requestedId) ||
      bundles.find((item) => item.id === stored) ||
      bundles[0];

    if (!requestedId || requestedId !== target.id) setUrl(target.id, requestedTab, true);
    if (selected?.bundle.id === target.id) return;

    let active = true;
    setBundleLoading(true);
    setError(null);
    void request<Content>(`/bundles/${target.id}/content`)
      .then((content) => {
        if (!active) return;
        setSelected(content);
        try {
          localStorage.setItem(`mdp:last-bundle:${user?.id || "anonymous"}`, target.id);
        } catch {
          // Continuity storage is best-effort.
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to open bundle.");
      })
      .finally(() => {
        if (active) setBundleLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bundles, loading, requestedId, requestedTab, request, selected?.bundle.id, setUrl, user?.id]);

  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  function open(bundle: Bundle) {
    if (bundle.payment_required) {
      setPlanPickerBundle(bundle);
      return;
    }
    let remembered: Tab = "overview";
    try {
      remembered = validTab(localStorage.getItem(`mdp:bundle-tab:${bundle.id}`));
    } catch {
      // Continuity storage is best-effort.
    }
    setUrl(bundle.id, remembered);
  }

  function changeTab(value: Tab) {
    setTab(value);
    try {
      if (selected) localStorage.setItem(`mdp:bundle-tab:${selected.bundle.id}`, value);
    } catch {
      // Continuity storage is best-effort.
    }
    setUrl(selected?.bundle.id || requestedId, value);
  }

  function moveBundle(currentIndex: number, direction: -1 | 1) {
    const next = bundles[currentIndex + direction];
    if (next) open(next);
  }

  async function enroll(bundle: Bundle) {
    try {
      await request(`/bundles/${bundle.id}/enroll`, { method: "POST" });
      notify({
        title: "Bundle joined",
        description: `${bundle.title} is now available in My Bundles.`,
        tone: "success",
      });
      await load();
      setUrl(bundle.id, "overview");
    } catch (cause) {
      notify({
        title: "Unable to join bundle",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setCreating(true);
    try {
      const created = await request<Bundle>("/bundles", {
        method: "POST",
        body: {
          title: String(data.get("title")),
          slug: String(data.get("slug")),
          description: String(data.get("description") || ""),
          academic_year: Number(data.get("year")),
          access_mode: "PUBLIC",
          is_free: true,
        },
      });
      form.reset();
      notify({ title: "Draft bundle created", description: created.title, tone: "success" });
      await load();
      setUrl(created.id, "overview");
    } catch (cause) {
      notify({
        title: "Unable to create bundle",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  const tabCounts = useMemo<Record<Tab, number | null> | null>(
    () =>
      selected
        ? {
            overview: null,
            curriculum: selected.totals.weeks,
            questions: selected.totals.questions,
            exams: selected.totals.past_exams,
            flashcards: selected.totals.flashcard_decks,
            resources: selected.totals.resources,
          }
        : null,
    [selected],
  );

  return (
    <ProductShell search="Search bundles, courses, weeks, or lectures">
      <main className="pp-page bundle-page">
        <div className="pp-title hero">
          <div>
            <small className="page-eyebrow">{manager ? "BUNDLE MANAGEMENT" : "YOUR LEARNING ACCESS"}</small>
            <h1>{manager ? "Bundles" : "My Bundles"}</h1>
            <p>
              {manager
                ? "Compose selected courses and weeks into a publishable learning workspace."
                : "Courses, questions, exams, flashcards and resources are scoped to your enrolled bundles."}
            </p>
          </div>
          <button className="pp-button secondary" onClick={() => void load()}>
            <FiRefreshCw /> Refresh
          </button>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {manager && (
          <Panel title="Create a free bundle" className="bundle-create">
            <form onSubmit={create}>
              <label>
                Title
                <input name="title" minLength={3} required />
              </label>
              <label>
                Slug
                <input name="slug" minLength={3} required />
              </label>
              <label>
                Academic year
                <select name="year" defaultValue="1">
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <input name="description" />
              </label>
              <button className="pp-button" disabled={creating}>
                <FiPlus /> {creating ? "Creating…" : "Create draft"}
              </button>
            </form>
          </Panel>
        )}

        {loading ? (
          <PageSkeleton variant="workspace" label="Loading bundles" />
        ) : (
          <div className="bundle-workspace">
            <aside className="bundle-list" aria-label={manager ? "Managed bundles" : "Your bundles"}>
              <h2>{manager ? "Managed bundles" : "Available to you"}</h2>
              {bundles.length ? (
                bundles.map((bundle, index) => (
                  <button
                    className={[
                      selected?.bundle.id === bundle.id ? "active" : "",
                      bundle.payment_required ? "locked" : "",
                    ].join(" ").trim()}
                    key={bundle.id}
                    aria-disabled={bundle.payment_required || undefined}
                    title={bundle.payment_required ? "Payment required to unlock this bundle" : undefined}
                    onClick={() => open(bundle)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveBundle(index, 1);
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveBundle(index, -1);
                      }
                    }}
                  >
                    <span>
                      <FiLayers />
                    </span>
                    <b>
                      {bundle.title}
                      <small>
                        Year {bundle.academicYear} · {bundle.payment_required ? "Payment required" : bundle.status}
                      </small>
                    </b>
                    {bundle.payment_required || bundle.read_only || bundle.status === "DRAFT" ? <FiLock /> : <FiCheckCircle />}
                  </button>
                ))
              ) : (
                <p>No bundles are assigned yet.</p>
              )}
            </aside>

            <section className={`bundle-content ${bundleLoading ? "is-loading" : ""}`} aria-busy={bundleLoading}>
              {selected ? (
                <>
                  <div className="bundle-hero">
                    <div>
                      <small>ACADEMIC YEAR {selected.bundle.academicYear}</small>
                      <h1>{selected.bundle.title}</h1>
                      <p>{selected.bundle.description || "No description has been added yet."}</p>
                    </div>
                    <span className={selected.bundle.read_only ? "expired" : "active"}>
                      {selected.bundle.read_only ? (
                        <>
                          <FiLock /> Read-only
                        </>
                      ) : (
                        <>
                          <FiCheckCircle /> Active access
                        </>
                      )}
                    </span>
                  </div>

                  <nav className="bundle-tabs" aria-label="Bundle sections">
                    {tabs.map((value) => {
                      const count = tabCounts?.[value];
                      return (
                        <button
                          key={value}
                          className={tab === value ? "active" : ""}
                          aria-current={tab === value ? "page" : undefined}
                          onClick={() => changeTab(value)}
                        >
                          {value === "questions"
                            ? "Question Bank"
                            : value === "exams"
                              ? "Past Exams"
                              : value[0].toUpperCase() + value.slice(1)}
                          {count !== null && count !== undefined ? <small>{count}</small> : null}
                        </button>
                      );
                    })}
                  </nav>

                  {bundleLoading && (
                    <div className="bundle-content-overlay">
                      <PageSkeleton variant="cards" label="Loading selected bundle" />
                    </div>
                  )}
                  <BundleTab content={selected} tab={tab} />
                </>
              ) : (
                <Panel title="Choose a bundle">
                  <p>Select a bundle to open its workspace.</p>
                </Panel>
              )}
            </section>
          </div>
        )}

        {!manager && catalog.length > 0 && (
          <section className="bundle-catalog">
            <div className="pp-title">
              <div>
                <h2>Free bundle catalog</h2>
                <p>Informational enrollment only. No payment service is connected.</p>
              </div>
            </div>
            <div>
              {catalog.map((bundle) => (
                <Panel key={bundle.id} title={bundle.title}>
                  <small>YEAR {bundle.academicYear}</small>
                  <p>{bundle.description || "Published learning bundle"}</p>
                  <button className="pp-button" onClick={() => void enroll(bundle)}>
                    Join free bundle
                  </button>
                  {(bundle.firstPlanEnabled || bundle.finalPlanEnabled) && (
                    <button className="pp-button secondary" type="button" onClick={() => setPlanPickerBundle(bundle)}>
                      View subscription plans
                    </button>
                  )}
                </Panel>
              ))}
            </div>
          </section>
        )}

        {planPickerBundle && (
          <PlanPickerModal
            bundle={planPickerBundle}
            onClose={() => setPlanPickerBundle(null)}
          />
        )}
      </main>
    </ProductShell>
  );
}

function PlanPickerModal({
  bundle,
  onClose,
}: {
  bundle: Bundle;
  onClose: () => void;
}) {
  const currency = bundle.priceCurrency || "EGP";
  const money = (value?: string | null) => (value ? `${currency} ${Number(value).toFixed(2)}` : null);
  return (
    <div className="role-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="role-modal" role="dialog" aria-modal="true" aria-label={`Choose access for ${bundle.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{bundle.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </header>
        <div className="role-form">
          <p>Choose how you&apos;d like to access this bundle.</p>

          {!bundle.isFree && bundle.priceAmount && (
            <>
              <article className="bundle-plan-option">
                <div><b>Full bundle</b><small>Every course, week, assessment, flashcard, and resource in this bundle.</small></div>
                <strong>{money(bundle.priceAmount)}</strong>
              </article>
              <fieldset className="bundle-plan-fieldset bundle-payment-preview">
                <legend>Choose a payment method</legend>
                <p>Payment selection preview only. No account or card information is requested yet.</p>
                <div className="bundle-payment-methods">
                  {[
                    { name: "Fawry Pay", detail: "Pay through a Fawry reference" },
                    { name: "InstaPay", detail: "Transfer through InstaPay" },
                    { name: "Mastercard", detail: "Card payment" },
                    { name: "Telda", detail: "Pay with Telda" },
                  ].map((method) => (
                    <button className="bundle-plan-option" type="button" aria-disabled="true" title="Checkout flow will be connected later" key={method.name}>
                      <span><b>{method.name}</b><small>{method.detail}</small></span>
                      <em>Preview</em>
                    </button>
                  ))}
                </div>
                <button className="pp-button" type="button" disabled>
                  Subscribe for {money(bundle.priceAmount)}
                </button>
              </fieldset>
            </>
          )}

          <p className="bundle-plan-note">Checkout is intentionally disabled until each provider flow is specified and connected.</p>
        </div>
      </section>
    </div>
  );
}

function BundleTab({ content, tab }: { content: Content; tab: Tab }) {
  const lectures = content.courses.flatMap((course) =>
    course.weeks.flatMap((week) => week.lectures.map((lecture) => ({ course, week, lecture }))),
  );

  if (tab === "overview") {
    return (
      <>
        <section className="bundle-summary-grid">
          {Object.entries(content.totals).map(([label, value]) => (
            <Panel key={label}>
              <b>{value}</b>
              <small>{label.replaceAll("_", " ")}</small>
            </Panel>
          ))}
        </section>
        <Panel title="Continue your curriculum">
          {lectures.slice(0, 4).map(({ course, week, lecture }) => (
            <Link
              className="bundle-row"
              key={lecture.id}
              href={`/guidelines?course=${course.id}&lecture=${lecture.id}`}
            >
              <FiBookOpen />
              <span>
                <b>{lecture.title}</b>
                <small>
                  Week {week.weekNumber} · {lecture.question_count} questions · {lecture.flashcard_deck_count} decks
                </small>
              </span>
            </Link>
          ))}
        </Panel>
      </>
    );
  }

  if (tab === "curriculum") {
    return (
      <section className="bundle-accordion-stack">
        {content.courses.map((course) => (
          <Panel key={course.id} title={`${course.courseCode} · ${course.courseName}`} className="bundle-course">
            {course.weeks.map((week, weekIndex) => (
              <BundleWeekDetails
                key={week.id}
                course={course}
                week={week}
                initiallyOpen={weekIndex === 0}
              />
            ))}
          </Panel>
        ))}
      </section>
    );
  }

  if (tab === "questions") {
    return (
      <Panel title="Bundle Question Bank">
        <p>Choose lectures inside this bundle to define exactly what the quiz covers.</p>
        {lectures.map(({ course, week, lecture }) => (
          <Link
            className="bundle-row"
            href={`/guidelines?course=${course.id}&lecture=${lecture.id}`}
            key={lecture.id}
          >
            <FiFileText />
            <span>
              <b>{lecture.title}</b>
              <small>Week {week.weekNumber}</small>
            </span>
            <strong>{lecture.question_count} Qs</strong>
          </Link>
        ))}
      </Panel>
    );
  }

  if (tab === "exams") {
    return (
      <Panel title="Bundle Past Exams">
        {content.past_exams.length ? (
          content.past_exams.map((exam) => (
            <article className="bundle-row" key={exam.id}>
              <FiClock />
              <span>
                <b>{exam.title}</b>
                <small>{exam.durationMinutes ? `${exam.durationMinutes} minutes` : "Untimed"}</small>
              </span>
            </article>
          ))
        ) : (
          <p>No past exams are assigned to this bundle.</p>
        )}
      </Panel>
    );
  }

  if (tab === "flashcards") {
    return (
      <Panel title="Bundle Flashcards">
        {lectures
          .filter((item) => item.lecture.flashcard_deck_count)
          .map(({ week, lecture }) => (
            <Link className="bundle-row" href={`/flashcards?lecture=${lecture.id}`} key={lecture.id}>
              <FiLayers />
              <span>
                <b>{lecture.title}</b>
                <small>Week {week.weekNumber}</small>
              </span>
              <strong>{lecture.flashcard_deck_count} decks</strong>
            </Link>
          ))}
      </Panel>
    );
  }

  return (
    <Panel title="Bundle Resources">
      {lectures
        .filter((item) => item.lecture.resource_count)
        .map(({ course, week, lecture }) => (
          <Link
            className="bundle-row"
            href={`/guidelines?course=${course.id}&lecture=${lecture.id}`}
            key={lecture.id}
          >
            <FiBookOpen />
            <span>
              <b>{lecture.title}</b>
              <small>Week {week.weekNumber}</small>
            </span>
            <strong>{lecture.resource_count} files</strong>
          </Link>
        ))}
    </Panel>
  );
}

function BundleWeekDetails({
  course,
  week,
  initiallyOpen,
}: {
  course: Course;
  week: Week;
  initiallyOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const questions = week.lectures.reduce((sum, lecture) => sum + lecture.question_count, 0);
  const decks = week.lectures.reduce((sum, lecture) => sum + lecture.flashcard_deck_count, 0);
  const resources = week.lectures.reduce((sum, lecture) => sum + lecture.resource_count, 0);

  return (
    <details open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary>
        <span>
          <b>
            Week {week.weekNumber}: {week.title || "Untitled week"}
          </b>
          <small>
            {questions} questions · {decks} decks · {resources} resources
          </small>
        </span>
        <small>{week.lectures.length} lectures</small>
        <FiChevronDown aria-hidden="true" />
      </summary>
      <div>
        {week.lectures.map((lecture) => (
          <Link href={`/guidelines?course=${course.id}&lecture=${lecture.id}`} key={lecture.id}>
            <FiBookOpen />
            <span>
              <b>
                {lecture.lectureNumber}. {lecture.title}
              </b>
              <small>
                {lecture.question_count} questions · {lecture.flashcard_deck_count} decks · {lecture.resource_count}{" "}
                resources
              </small>
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

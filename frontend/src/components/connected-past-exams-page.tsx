"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiBookOpen, FiCheck, FiClock, FiFileText, FiPlayCircle } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./exam-launch.css";

type Bundle = { id: string; title: string; read_only?: boolean };
type Exam = {
  id: string;
  title: string;
  description: string | null;
  testType: "LECTURE" | "WEEK" | "COURSE" | "CUSTOM" | "QUESTION_BANK";
  durationMinutes: number | null;
  totalMarks: string | null;
  passingMarks: string | null;
};
type BundleContent = { bundle: Bundle; past_exams: Exam[] };
type ActiveAttempt = { id: string; test_mode: "TUTOR" | "TIMED"; started_at: string | null };
type LaunchConfig = {
  test: Exam;
  question_count: number;
  mcq_count: number;
  is_final: boolean;
  required_question_count: number;
  timed_available: boolean;
  launch_ready: boolean;
  active_attempt: ActiveAttempt | null;
  issues: string[];
};
type Attempt = { id: string; testId: string; testMode: "TUTOR" | "TIMED" };
type Mode = "TUTOR" | "TIMED";

export function ConnectedPastExamsPage() {
  const { request } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBundle = searchParams.get("bundle");
  const requestedTest = searchParams.get("test");
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleId, setBundleId] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [config, setConfig] = useState<LaunchConfig | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void request<Bundle[]>("/bundles/mine")
      .then((rows) => {
        if (!active) return;
        setBundles(rows);
        setBundleId(rows.find((bundle) => bundle.id === requestedBundle)?.id || rows[0]?.id || "");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load your exam bundles.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, requestedBundle]);

  useEffect(() => {
    if (!bundleId) {
      setExams([]);
      setSelectedId("");
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void request<BundleContent>(`/bundles/${bundleId}/content`)
      .then((content) => {
        if (!active) return;
        setExams(content.past_exams || []);
        const requested = content.past_exams.find((exam) => exam.id === requestedTest);
        setSelectedId(requested?.id || content.past_exams[0]?.id || "");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load configured exams.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bundleId, request, requestedTest]);

  useEffect(() => {
    setMode(null);
    if (!selectedId) {
      setConfig(null);
      return;
    }
    let active = true;
    setLoadingConfig(true);
    setError(null);
    void request<LaunchConfig>(`/test-launch/${selectedId}`)
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setMode(value.active_attempt?.test_mode ?? null);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load exam configuration.");
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => {
      active = false;
    };
  }, [request, selectedId]);

  const currentBundle = bundles.find((bundle) => bundle.id === bundleId);
  const selected = useMemo(() => exams.find((exam) => exam.id === selectedId) || null, [exams, selectedId]);
  const activeAttempt = config?.active_attempt ?? null;
  const timedDisabled = !config?.timed_available;
  const launchDisabled = activeAttempt
    ? !config?.launch_ready || Boolean(currentBundle?.read_only)
    : !mode || !config?.launch_ready || Boolean(currentBundle?.read_only) || (mode === "TIMED" && timedDisabled);

  async function startExam() {
    if (!selected || launchDisabled || starting) return;
    setStarting(true);
    setError(null);
    try {
      if (activeAttempt) {
        router.push(`/mock-exam/session?attempt=${activeAttempt.id}&test=${selected.id}&source=past-exams&mode=${activeAttempt.test_mode}`);
        return;
      }
      if (!mode) return;
      const attempt = await request<Attempt>(`/tests/${selected.id}/attempts`, { method: "POST", body: { test_mode: mode } });
      const actualMode = attempt.testMode || mode;
      router.push(`/mock-exam/session?attempt=${attempt.id}&test=${selected.id}&source=past-exams&mode=${actualMode}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start this exam.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <ProductShell search="Search configured exams">
      <main className="pp-page exam-launch-page">
        <header className="exam-launch-heading">
          <div><small>ASSESSMENT LAUNCHER</small><h1>Mock Exam</h1><p>Choose a configured exam or resume an unfinished practice attempt. New exams require an explicit Tutor or Timed mode choice.</p></div>
          <label>Bundle<select value={bundleId} onChange={(event) => setBundleId(event.target.value)}>{bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.title}{bundle.read_only ? " · read-only" : ""}</option>)}</select></label>
        </header>

        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <div className="product-auth-loading">Loading configured exams…</div> : !bundles.length ? <Panel title="No bundle access"><p>You need an active bundle before configured exams can be launched.</p></Panel> : !exams.length ? <Panel title="No configured exams"><p>The instructor has not attached a published exam to this bundle yet.</p></Panel> : (
          <div className="exam-launch-layout">
            <aside className="exam-launch-list">
              <header><b>Available exams & practice</b><small>{exams.length}</small></header>
              {exams.map((exam) => (
                <button type="button" className={exam.id === selectedId ? "active" : ""} key={exam.id} onClick={() => setSelectedId(exam.id)}>
                  <span><FiFileText /></span>
                  <div><b>{exam.title}</b><small>{exam.testType === "CUSTOM" ? "PRACTICE · Tutor session" : `${exam.testType} · ${exam.durationMinutes ? `${exam.durationMinutes} min timed configuration` : "Tutor only"}`}</small></div>
                </button>
              ))}
            </aside>

            <section className="exam-launch-main">
              {selected ? (
                <>
                  <section className="exam-launch-hero">
                    <div><small>{config?.is_final ? "FINAL EXAM" : selected.testType === "CUSTOM" ? "PRACTICE SESSION" : selected.testType}</small><h2>{selected.title}</h2><p>{selected.description || "No description was provided by the instructor."}</p></div>
                    <div className="exam-launch-metrics">
                      <span><FiFileText /><b>{loadingConfig ? "—" : config?.question_count ?? "—"}</b><small>Questions configured</small></span>
                      <span><FiBookOpen /><b>{loadingConfig ? "—" : config?.mcq_count ?? "—"}</b><small>MCQs</small></span>
                      <span><FiClock /><b>{selected.durationMinutes ? `${selected.durationMinutes}m` : "Untimed"}</b><small>Instructor duration</small></span>
                    </div>
                  </section>

                  {activeAttempt ? <section className="exam-resume-banner" role="status">
                    <div><small>UNFINISHED ATTEMPT</small><h3>Continue where you stopped</h3><p>This {selected.testType === "CUSTOM" ? "practice session" : "exam"} is already in progress in <b>{activeAttempt.test_mode === "TIMED" ? "Timed" : "Tutor"}</b> mode. Starting again will resume the same attempt instead of creating a duplicate.</p></div>
                    <FiPlayCircle />
                  </section> : <section className="exam-mode-picker">
                    <div className="exam-mode-intro"><small>CHOOSE MODE BEFORE STARTING</small><h3>How do you want to take this exam?</h3><p>Timed mode uses the duration configured by the instructor. Tutor mode is untimed and reveals explanations after each answer.</p></div>
                    <div className="exam-mode-grid">
                      <button type="button" className={mode === "TUTOR" ? "active" : ""} onClick={() => setMode("TUTOR")}>
                        <span><FiBookOpen /></span><b>Tutor mode</b><p>Untimed. Answer → explanation → next question.</p>{mode === "TUTOR" && <FiCheck />}
                      </button>
                      <button type="button" disabled={timedDisabled} className={mode === "TIMED" ? "active" : ""} onClick={() => setMode("TIMED")}>
                        <span><FiClock /></span><b>Timed mode</b><p>{timedDisabled ? "The instructor did not configure a duration." : `${selected.durationMinutes} minutes, auto-submit when time expires.`}</p>{mode === "TIMED" && !timedDisabled && <FiCheck />}
                      </button>
                    </div>
                  </section>}

                  {config?.is_final && (
                    <section className={`final-exam-rule ${config.launch_ready ? "ready" : "blocked"}`}>
                      <div><small>FINAL EXAM RULE</small><h3>200 MCQs required</h3><p>A Final cannot launch unless the instructor has configured exactly 200 questions and all 200 are MCQs. In-session navigation is split into five 40-question blocks.</p></div>
                      <strong>{config.mcq_count} / 200 MCQs</strong>
                    </section>
                  )}

                  {config?.issues.length ? <section className="exam-launch-issues"><b>Configuration check</b>{config.issues.map((issue) => <p key={issue}>{issue}</p>)}</section> : null}

                  <footer className="exam-launch-footer">
                    <div><small>{activeAttempt ? "Resuming" : "Starting"}</small><b>{activeAttempt ? `${activeAttempt.test_mode === "TIMED" ? "Timed" : "Tutor"} · existing attempt` : !mode ? "Choose Tutor or Timed mode" : mode === "TIMED" ? `Timed · ${selected.durationMinutes} minutes` : "Tutor · untimed"}</b></div>
                    <button className="pp-button" type="button" disabled={launchDisabled || starting || loadingConfig} onClick={() => void startExam()}><FiPlayCircle />{starting ? "Opening…" : activeAttempt ? selected.testType === "CUSTOM" ? "Resume practice" : "Resume exam" : !mode ? "Choose a mode" : config?.is_final ? "Start 200-MCQ Final" : "Start exam"}</button>
                  </footer>
                </>
              ) : <Panel title="Select an exam"><p>Choose an instructor-configured assessment from the left.</p></Panel>}
            </section>
          </div>
        )}
      </main>
    </ProductShell>
  );
}

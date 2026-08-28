"use client";

import { useEffect, useState } from "react";
import { FiAward, FiCheckCircle } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { useLocale } from "./locale-provider";

type Achievement = {
  id: string;
  category: string;
  title: string;
  description: string;
  current: number;
  threshold: number;
  unlocked_at: string;
};

type Milestone = {
  id: string;
  category: string;
  title: string;
  description: string;
  current: number;
  threshold: number;
  progress: number;
};

type AchievementSync = {
  xp: number;
  level: number;
  level_progress: number;
  unlocked: Achievement[];
  next_milestones: Milestone[];
};

export function AchievementMilestonesPanel() {
  const { user, request } = useAuth();
  const { translate } = useLocale();
  const [data, setData] = useState<AchievementSync | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "STUDENT") return;
    let active = true;
    void request<AchievementSync>("/progress/achievements/sync", { method: "POST" })
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, user?.id, user?.role]);

  if (user?.role !== "STUDENT") return null;

  return <section className="dash-card achievement-milestones-card" aria-labelledby="achievement-milestones-title">
    <header>
      <h2 id="achievement-milestones-title">{translate("Milestones")}</h2>
      {data && <span>{translate(`${data.unlocked.length} unlocked`)}</span>}
    </header>
    {loading && !data ? <p>{translate("Checking verified progress…")}</p> : data ? <>
      <div className="achievement-level-summary">
        <span className="achievement-level-icon"><FiAward /></span>
        <div>
          <strong>{translate(`Level ${data.level}`)}</strong>
          <small>{translate(`${data.xp} verified XP`)}</small>
          <div className="achievement-level-bar" aria-label={translate(`${data.level_progress}% toward the next level`)}><i style={{ width: `${data.level_progress}%` }} /></div>
        </div>
      </div>
      {data.unlocked[0] && <article className="achievement-latest">
        <FiCheckCircle />
        <div><small>{translate("LATEST UNLOCK")}</small><strong>{translate(data.unlocked[0].title)}</strong><p>{translate(data.unlocked[0].description)}</p></div>
      </article>}
      <div className="achievement-next-list">
        {(data.next_milestones.length ? data.next_milestones.slice(0, 4) : []).map((milestone) => <article key={milestone.id}>
          <div><strong>{translate(milestone.title)}</strong><span>{milestone.current} / {milestone.threshold}</span></div>
          <div className="achievement-milestone-bar" aria-label={translate(`${milestone.progress}% complete`)}><i style={{ width: `${milestone.progress}%` }} /></div>
          <small>{translate(milestone.description)}</small>
        </article>)}
        {!data.next_milestones.length && <p>{translate("Every configured milestone is unlocked. Keep learning; future milestones will appear here.")}</p>}
      </div>
    </> : <p>{translate("Achievement history is temporarily unavailable.")}</p>}
  </section>;
}

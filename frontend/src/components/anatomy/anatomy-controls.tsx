"use client";

/**
 * The side panel: search, layer controls, and the structure list.
 *
 * Split out of anatomy-viewer.tsx because none of it touches three.js - it is ordinary DOM
 * driven by the view state, and keeping it separate makes the WebGL component readable.
 */

import { useDeferredValue, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { SYSTEM_COLOURS } from "./anatomy-viewer";
import type { AnatomyStructure, AnatomySystem } from "./anatomy-viewer";

export function AnatomyControls({
  title, systems, structures, selectedId,
  hiddenSystems, ghostSystems, systemOpacity,
  onSelect, onToggleSystem, onToggleGhost, onOpacity, footer,
}: {
  title: string;
  systems: AnatomySystem[];
  structures: AnatomyStructure[];
  selectedId: string | null;
  hiddenSystems: Set<string>;
  ghostSystems: Set<string>;
  systemOpacity: Record<string, number>;
  onSelect: (s: AnatomyStructure) => void;
  onToggleSystem: (key: string) => void;
  onToggleGhost: (key: string) => void;
  onOpacity: (key: string, value: number) => void;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  // Typing filters a list that can be 500+ rows; deferring keeps the input responsive.
  const deferredQuery = useDeferredValue(query);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of structures) map[s.system] = (map[s.system] ?? 0) + 1;
    return map;
  }, [structures]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return structures
      .filter((s) => !hiddenSystems.has(s.system))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [structures, hiddenSystems, deferredQuery]);

  return (
    <div className="anatomy-viewer__side">
      <h2 className="anatomy-viewer__title">{title}</h2>

      <label className="anatomy-search">
        <span className="sr-only">Search structures</span>
        <input
          type="search"
          value={query}
          placeholder={`Search ${structures.length} structures…`}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {systems.length > 1 ? (
        <fieldset className="anatomy-layers">
          <legend>Layers</legend>
          {systems.map((system) => {
            const hidden = hiddenSystems.has(system.key);
            const ghost = ghostSystems.has(system.key);
            return (
              <div key={system.key} className={`anatomy-layers__row${hidden ? " is-off" : ""}`}>
                <label className="anatomy-layers__toggle">
                  <input type="checkbox" checked={!hidden} onChange={() => onToggleSystem(system.key)} />
                  <i style={{ background: SYSTEM_COLOURS[system.key] ?? SYSTEM_COLOURS.other }} aria-hidden="true" />
                  <span>{system.label}</span>
                  <b>{counts[system.key] ?? 0}</b>
                </label>
                <div className="anatomy-layers__opacity">
                  <button
                    type="button"
                    className={ghost ? "is-active" : undefined}
                    onClick={() => onToggleGhost(system.key)}
                    disabled={hidden}
                    title="Make this layer translucent so you can see through it"
                  >
                    Ghost
                  </button>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round((systemOpacity[system.key] ?? 0.25) * 100)}
                    disabled={hidden || !ghost}
                    onChange={(e) => onOpacity(system.key, Number(e.target.value) / 100)}
                    aria-label={`${system.label} opacity`}
                  />
                </div>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      <ol className="anatomy-viewer__list">
        {visible.map((structure) => (
          <li key={structure.id}>
            <button
              type="button"
              className={structure.id === selectedId ? "is-selected" : undefined}
              onClick={() => onSelect(structure)}
            >
              <i style={{ background: SYSTEM_COLOURS[structure.system] ?? SYSTEM_COLOURS.other }} aria-hidden="true" />
              {structure.name}
            </button>
          </li>
        ))}
        {!visible.length ? <li className="anatomy-viewer__empty">No structures match “{query}”.</li> : null}
      </ol>

      {footer}
    </div>
  );
}

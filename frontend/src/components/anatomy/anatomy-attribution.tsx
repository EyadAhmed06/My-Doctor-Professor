"use client";

/**
 * Attribution for the 3D models.
 *
 * Everything in this viewer is CC BY-SA, which makes this a licence obligation rather than a
 * courtesy: the credit has to be visible beside the model, not buried in a licence file. The
 * chain matters too - Open3Dmodel is a retopologised derivative of Z-Anatomy, which is in
 * turn derived from BodyParts3D - and ShareAlike means every link stays credited.
 *
 * `removedTextures` exists because the muscle textures Open3Dmodel ships are CC BY-NC-SA,
 * not CC BY-SA. They are stripped at build time (see scripts/anatomy/prepare-model.mjs) so
 * this platform stays commercially licensable, and the viewer says so rather than leaving a
 * silent difference between what upstream published and what we render.
 */

const SOURCES = [
  {
    work: "Open3Dmodel",
    holder: "AnatomyTOOL — Leiden UMC, Utrecht, Maastricht, Leuven",
    licence: "CC BY-SA 4.0",
    licenceHref: "https://creativecommons.org/licenses/by-sa/4.0/",
    workHref: "https://anatomytool.org/open3dmodel-create",
  },
  {
    work: "Z-Anatomy",
    holder: "predecessor model",
    licence: "CC BY-SA 4.0",
    licenceHref: "https://creativecommons.org/licenses/by-sa/4.0/",
    workHref: "https://github.com/Z-Anatomy/Models-of-human-anatomy",
  },
  {
    work: "BodyParts3D",
    holder: "© The Database Center for Life Science",
    licence: "CC BY-SA 2.1 Japan",
    licenceHref: "https://creativecommons.org/licenses/by-sa/2.1/jp/",
    workHref: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html",
  },
] as const;

export function AnatomyAttribution({
  removedTextures = [],
  compact = false,
}: { removedTextures?: string[]; compact?: boolean }) {
  return (
    <aside className={`anatomy-credit${compact ? " anatomy-credit--compact" : ""}`} aria-label="3D model attribution">
      <h2 className="anatomy-credit__heading">Model credits</h2>
      <ul className="anatomy-credit__list">
        {SOURCES.map((source) => (
          <li key={source.work}>
            <a href={source.workHref} target="_blank" rel="noreferrer noopener">{source.work}</a>{" "}
            <span className="anatomy-credit__holder">{source.holder}</span>{" — "}
            <a href={source.licenceHref} target="_blank" rel="noreferrer noopener">{source.licence}</a>
          </li>
        ))}
      </ul>
      <p className="anatomy-credit__share">
        Converted for the web by My Doctor Professor and redistributed under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer noopener">CC BY-SA 4.0</a>.
      </p>
      {removedTextures.length ? (
        <p className="anatomy-credit__note">
          {removedTextures.length} muscle texture{removedTextures.length === 1 ? "" : "s"} from
          the upstream model {removedTextures.length === 1 ? "is" : "are"} licensed
          CC BY-NC-SA (non-commercial) and {removedTextures.length === 1 ? "has" : "have"} been
          removed; those surfaces render as flat colour.
        </p>
      ) : null}
    </aside>
  );
}

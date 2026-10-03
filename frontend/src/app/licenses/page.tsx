import type { Metadata } from "next";
import Link from "next/link";
import { FiArrowLeft, FiShield } from "react-icons/fi";
import { BrandLockup } from "@/components/brand";
import "@/components/public-legal-page.css";

export const metadata: Metadata = {
  title: "Third-party Licenses",
  description: "Attribution and license information for third-party materials used by My Doctor & The Professor.",
};

const externalProps = { target: "_blank", rel: "noreferrer noopener" } as const;

export default function Page() {
  return (
    <main className="public-legal-page">
      <header className="public-legal-header">
        <BrandLockup href="/" />
        <Link href="/"><FiArrowLeft /> Back to home</Link>
      </header>

      <article className="public-legal-card">
        <span className="public-legal-icon"><FiShield /></span>
        <small>MY DOCTOR &amp; THE PROFESSOR</small>
        <h1>Third-party Licenses</h1>
        <p className="public-legal-intro">
          This page records attribution, licensing, and modifications for third-party 3D anatomy material used by the platform.
          These notices do not change the license of unrelated application code or client-owned content.
        </p>

        <div className="public-legal-sections">
          <section>
            <h2>Open3DModel / AnatomyTOOL</h2>
            <p>
              The 3D anatomy experience uses adapted Open3DModel assets from AnatomyTOOL, including the skeleton, skull,
              exploded skull, skull base, vertebrae, upper limb, lower limb, and hand/wrist model sets.
            </p>
            <p>
              Source:{" "}
              <a href="https://anatomytool.org/open3dmodel-create" {...externalProps}>Open3DModel at AnatomyTOOL</a>.
              {" "}Open3DModel source records identify the model family as CC BY-SA. The adapted production model files
              used here are marked and redistributed under{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" {...externalProps}>CC BY-SA 4.0</a>.
            </p>
            <p>
              Credit belongs to the Open3D project and the creators and institutions identified on the corresponding
              AnatomyTOOL source pages. Attribution does not imply endorsement of My Doctor &amp; The Professor.
            </p>
          </section>

          <section>
            <h2>Changes made for this platform</h2>
            <p>
              The source models are converted and optimized for browser delivery. Depending on the model, changes include
              mesh simplification, Draco compression, bilateral mirroring where the source supplies one side, normalized
              display names, system classification, interactive metadata, and embedded attribution metadata.
            </p>
            <p>
              Those adapted model files remain under CC BY-SA 4.0 in accordance with the ShareAlike requirement applied
              to the production derivatives.
            </p>
          </section>

          <section>
            <h2>Non-commercial textures are not shipped</h2>
            <p>
              Upstream muscle textures named “Muscle tiles”, “Muscle tiles plain”, “Muscle long tendons”, and “Tendon only”
              are identified as CC BY-NC-SA material. They are removed from the commercial production models, and the affected
              surfaces are rendered using flat color instead.
            </p>
            <p>
              See the{" "}
              <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" {...externalProps}>CC BY-NC-SA 4.0 terms</a>.
            </p>
          </section>

          <section>
            <h2>Upstream attribution chain</h2>
            <p>
              Open3DModel is based in part on{" "}
              <a href="https://github.com/Z-Anatomy/Models-of-human-anatomy" {...externalProps}>Z-Anatomy</a>,
              licensed CC BY-SA 4.0, and predecessor BodyParts3D material from{" "}
              <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html" {...externalProps}>
                The Database Center for Life Science
              </a>.
              {" "}The historical derivative chain identifies that predecessor BodyParts3D contribution under{" "}
              <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" {...externalProps}>CC BY-SA 2.1 Japan</a>.
            </p>
          </section>

          <section>
            <h2>Your Creative Commons rights</h2>
            <p>
              Nothing in the platform Terms of Service is intended to remove or restrict rights granted under the applicable
              Creative Commons licenses for these third-party anatomy assets. The CC BY-SA model material may be shared and
              adapted, including commercially, subject to attribution and ShareAlike requirements.
            </p>
          </section>

          <section>
            <h2>Educational use</h2>
            <p>
              The anatomy viewer is an educational tool. It is not a substitute for professional medical advice, diagnosis,
              treatment, clinical judgment, or institution-specific teaching and assessment requirements.
            </p>
          </section>
        </div>

        <footer>
          <p>Questions about these notices can be sent to <a href="mailto:support@mydoctorprofessor.com">support@mydoctorprofessor.com</a>.</p>
          <nav>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/licenses">Third-party Licenses</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}

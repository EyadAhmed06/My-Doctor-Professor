#!/usr/bin/env node
/**
 * Prepare an Open3Dmodel .glb for the web viewer.
 *
 *   node anatomy/prepare-model.mjs --in <source.glb> --region upper-limb --label "Upper limb"
 *
 * Four jobs: three correctness, one delivery.
 *
 * 1. DECODE THE SOURCE. Every Open3Dmodel .glb lists KHR_draco_mesh_compression in
 *    extensionsRequired, so it must be decoded before anything below can edit the meshes.
 *    This step used to be the end of the story: the output was written decoder-free because
 *    the production CSP blocked WebAssembly and drei fetched its decoder from gstatic, a
 *    blocked origin. That cost 95 MB of raw geometry across eight regions - upper-limb alone
 *    was 31.2 MB, roughly two minutes at 2 Mbps - which is not a usable download for the
 *    students this is built for. Step 4 now re-compresses instead, and the two blockers are
 *    handled rather than avoided: the decoder is self-hosted at /draco/, and
 *    'wasm-unsafe-eval' is scoped to the /anatomy routes.
 *
 * 2. STRIP NON-COMMERCIAL TEXTURES. The models are CC BY-SA 4.0, but the muscle textures
 *    ("Muscle tiles", "Muscle long tendons", "Tendon only" - Claudia Krebs et al, UBC) are
 *    CC BY-NC-SA 4.0. NC is incompatible with a paid platform, so those maps are removed and
 *    the affected materials fall back to a flat colour. Every removal is reported by name.
 *    Pass --keep-nc to retain them for local-only evaluation.
 *
 * 3. CLASSIFY AND NAME. Each structure is bucketed into a system (bone, muscle, artery,
 *    vein, nerve, connective) from its own name, and ".r"/".l" suffixes become readable
 *    "(right)"/"(left)". Open3Dmodel's names are good, so nothing is invented - only tidied.
 *
 * 4. OPTIMISE FOR DELIVERY. Halve the triangle count, then Draco-compress. Measured on
 *    upper-limb: 31.2 MB -> 13.3 MB simplified, -> 5.2 MB Draco'd, -> ~2.6 MB with both.
 *    Use --no-compress for the old decoder-free output, or --simplify 1 to keep every
 *    triangle.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import draco3d from "draco3dgltf";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Textures published under CC BY-NC-SA rather than the models' CC BY-SA. */
const NON_COMMERCIAL_TEXTURES = /muscle tiles|muscle long tendons|tendon only|muscle tiles plain/i;

/**
 * Ordered most-specific-first: "Common tendon of biceps brachii" must land in muscle, not
 * connective, so muscle is tested before the tendon/ligament bucket.
 */
const SYSTEMS = [
  { key: "nerve", label: "Nerves", test: /\bnerve|plexus|ganglion\b/i },
  { key: "artery", label: "Arteries", test: /\bartery|arteries|arterial|aorta|aortic\b/i },
  { key: "vein", label: "Veins", test: /\bvein|veins|venous|vena\b/i },
  { key: "muscle", label: "Muscles", test: /muscle|tendon|biceps|triceps|deltoid|flexor|extensor|pronator|supinator|brachialis|brachioradialis|trapezius|latissimus|pectoral|serratus|rhomboid|teres|infraspinatus|supraspinatus|subscapularis|lumbrical|interosseous muscle|thenar|hypothenar|palmaris|anconeus|coracobrachialis|gluteus|gluteal|sartorius|gracilis|quadriceps|hamstring|semitendinosus|semimembranosus|adductor|abductor|soleus|gastrocnemius|tibialis|peroneus|fibularis|popliteus|plantaris|iliopsoas|piriformis|obturator|pectineus|vastus|rectus femoris/i },
  { key: "bone", label: "Bones", test: /\bbone|vertebra|humerus|radius|ulna|scapula|clavicle|sternum|rib\b|carpal|phalanx|capitate|hamate|lunate|pisiform|scaphoid|trapezoid|trapezium|triquetrum|sacrum|coccyx|metacarp|metatars|femur|tibia|fibula|patella|calcaneus|talus|navicular|cuneiform|cuboid|hip bone|atlas|axis|skull|mandible|maxilla|occipital|parietal|frontal|temporal|sphenoid|ethmoid|vomer|zygomatic|nasal|lacrimal|palatine|incisor|canine|molar|premolar|tooth/i },
  { key: "connective", label: "Ligaments & joints", test: /ligament|capsule|aponeurosis|septum|bursa|labrum|annulus|nucleus pulposus|retinaculum|membrane|sheath|fascia|cartilage|meniscus|disc|joint/i },
];

const classify = (name) => SYSTEMS.find((s) => s.test.test(name))?.key ?? "other";

/** "Mandible bone.r" -> "Mandible bone (right)". Blender's side suffix, made readable. */
function tidyName(raw) {
  let name = raw.replace(/\.(r|right)$/i, " (right)").replace(/\.(l|left)$/i, " (left)");
  name = name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { args[key] = true; continue; }
    args[key] = next; i += 1;
  }
  return args;
}

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

function countTriangles(root) {
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      triangles += (idx ? idx.getCount() : prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    }
  }
  return Math.round(triangles);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in && resolve(String(args.in));
  if (!inPath || !existsSync(inPath)) throw new Error(`--in must point at a source .glb. Got: ${inPath}`);
  const region = String(args.region || basename(inPath, ".glb"));
  const label = String(args.label || region);
  const outPath = resolve(String(args.out || `../frontend/public/anatomy/${region}.glb`));
  mkdirSync(dirname(outPath), { recursive: true });

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  const sourceBytes = statSync(inPath).size;
  const document = await io.read(inPath);
  const root = document.getRoot();

  console.log(`\n=== ${label} (${region}) ===`);
  console.log(`source: ${inPath}`);

  // 1. Drop Draco so the written file needs no decoder in the browser.
  let dracoRemoved = false;
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === KHRDracoMeshCompression.EXTENSION_NAME) { ext.dispose(); dracoRemoved = true; }
  }

  // 2. Remove non-commercially-licensed texture maps.
  const removed = [];
  if (!args["keep-nc"]) {
    for (const texture of root.listTextures()) {
      const name = texture.getName() || "";
      if (!NON_COMMERCIAL_TEXTURES.test(name)) continue;
      removed.push(name);
      // dispose() detaches the texture from every material that referenced it; those
      // materials keep their baseColorFactor and render as flat colour.
      texture.dispose();
    }
  }

  // 3. Mirror the bilateral structures.
  //
  // Open3Dmodel ships bilateral anatomy one-sided to halve the download - the skeleton has
  // 107 nodes suffixed ".r" and none suffixed ".l" - and expects the viewer to mirror them.
  // Without this you get half a skeleton. Every node transform in these files is identity
  // with geometry baked in world space and the sagittal plane at x=0, so a sibling node with
  // scale [-1,1,1] is an exact mirror; three.js flips the winding order itself when a world
  // matrix has negative determinant, so the normals stay correct.
  let mirrored = 0;
  if (!args["no-mirror"]) {
    const scene = root.listScenes()[0];
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      const name = node.getName() || "";
      const match = name.match(/\.(r|l)$/i);
      if (!mesh || !match) continue;
      const flipped = match[1].toLowerCase() === "r" ? "l" : "r";
      const mirrorName = name.replace(/\.(r|l)$/i, `.${flipped}`);
      // Skip if the other side genuinely ships in this model.
      if (root.listNodes().some((n) => n.getName() === mirrorName)) continue;
      const clone = document.createNode(mirrorName).setMesh(mesh).setScale([-1, 1, 1]);
      scene.addChild(clone);
      mirrored += 1;
    }
  }

  // 4. Name and classify every structure.
  const structures = [];
  const counts = {};
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const raw = node.getName() || "";
    if (!raw) continue;
    const name = tidyName(raw);
    const system = classify(raw);
    counts[system] = (counts[system] || 0) + 1;
    // Read back by the viewer as object.userData, so labels travel with the geometry.
    node.setExtras({ ...(node.getExtras() || {}), structureName: name, system });
    structures.push({ id: raw, name, system });
  }

  root.getAsset().copyright =
    "Open3Dmodel / AnatomyTOOL, CC BY-SA 4.0. Derived from BodyParts3D (Database Center for "
    + "Life Science, CC BY-SA 2.1 JP) and Z-Anatomy (CC BY-SA 4.0). Derived asset CC BY-SA 4.0.";

  // 4. Optimise for delivery.
  //
  // The models are for medical students on Egyptian mobile connections, where the
  // uncompressed output of steps 1-3 was unusable: upper-limb alone was 31.2 MB, about two
  // minutes of loading at 2 Mbps, and 95 MB of the 100 MB total was raw geometry rather
  // than texture.
  //
  // simplify() halves the triangle count; the source meshes are far denser than a viewer at
  // this scale can show. Draco then re-compresses what remains. Measured on upper-limb:
  // 31.2 MB -> 13.3 MB with simplify alone, -> 5.2 MB with Draco alone, -> ~2.6 MB together.
  //
  // Draco needs a WebAssembly decoder in the browser, which is why step 1 used to strip it.
  // That is now handled rather than avoided: the decoder is self-hosted at /draco/ (no
  // gstatic origin), and 'wasm-unsafe-eval' is added to script-src for the /anatomy routes
  // only - it permits WebAssembly compilation, not eval() of strings. Pass --no-compress to
  // reproduce the old decoder-free output.
  const compress = !args["no-compress"];
  const simplifyRatio = args["simplify"] === undefined ? 0.5 : Number(args["simplify"]);
  if (!Number.isFinite(simplifyRatio) || simplifyRatio <= 0 || simplifyRatio > 1) {
    throw new Error("--simplify must be a ratio in (0,1]; 1 keeps every triangle");
  }

  const trianglesBefore = countTriangles(root);
  if (compress) {
    await document.transform(dedup(), prune(), weld());
    if (simplifyRatio < 1) {
      // error is the permitted deviation as a fraction of mesh extent. 0.001 is tight enough
      // that bone landmarks stay where an examiner expects them.
      await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.001 }));
    }
    document.createExtension(KHRDracoMeshCompression)
      .setRequired(true)
      .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
  }

  const out = await io.writeBinary(document);
  writeFileSync(outPath, out);

  const triangles = countTriangles(root);

  const sidecar = resolve(HERE, "..", "..", "frontend", "src", "components", "anatomy", `${region}.json`);
  mkdirSync(dirname(sidecar), { recursive: true });
  writeFileSync(sidecar, `${JSON.stringify({
    region,
    label,
    generated: "by scripts/anatomy/prepare-model.mjs - do not edit by hand",
    nonCommercialTexturesRemoved: removed,
    systems: SYSTEMS.filter((s) => counts[s.key]).map((s) => ({ key: s.key, label: s.label }))
      .concat(counts.other ? [{ key: "other", label: "Other" }] : []),
    structures,
  }, null, 2)}\n`);

  console.log(`source draco       : ${dracoRemoved ? "decoded on the way in" : "none found"}`);
  console.log(`mirrored structures: ${mirrored} (source ships bilateral anatomy one-sided)`);
  console.log(`NC textures removed: ${removed.length ? removed.join(", ") : "none present"}`);
  console.log(`structures         : ${structures.length}  (${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ")})`);
  console.log(
    `triangles          : ${trianglesBefore.toLocaleString()} -> ${triangles.toLocaleString()}`
    + `${simplifyRatio < 1 && compress ? `  (simplify ratio ${simplifyRatio})` : ""}   draw calls ${root.listMeshes().length}`,
  );
  console.log(`materials/textures : ${root.listMaterials().length} / ${root.listTextures().length}`);
  console.log(
    `output compression : ${compress
      ? "draco (browser needs the self-hosted /draco/ decoder; 'wasm-unsafe-eval' is set for /anatomy routes)"
      : "none (--no-compress: decoder-free, much larger)"}`,
  );
  console.log(`size               : ${mb(sourceBytes)} source -> ${mb(out.byteLength)} written`);
  console.log(`wrote              : ${outPath}`);
}

main().catch((e) => { console.error(`\nFailed: ${e.message}\n`); process.exit(1); });

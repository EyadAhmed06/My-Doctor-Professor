"use client";

/* eslint-disable react-hooks/immutability --
 * three.js is an imperative, mutable API: selecting a structure means assigning to
 * material.color, hiding a layer means assigning to mesh.visible. Those objects are built in
 * a useMemo, so the React Compiler's immutability rule flags every such assignment. There is
 * no non-mutating way to drive three.js, and the alternatives (refs read during render,
 * rebuilding the scene graph per interaction) are each worse - the first is also a rule
 * violation, the second would re-upload every buffer to the GPU on each click. The mutations
 * below are confined to a scene graph this component clones and owns, and it disposes of the
 * materials it creates on unmount.
 */

/**
 * The WebGL half of the anatomy viewer. Never imported directly by a route - it comes in via
 * anatomy-viewer-mount.tsx with ssr:false, because three.js cannot render on the server and
 * the resulting failure looks like a three.js bug rather than an SSR mistake.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { AnatomyAttribution } from "./anatomy-attribution";
import { AnatomyControls } from "./anatomy-controls";

export type AnatomyStructure = { id: string; name: string; system: string };
export type AnatomySystem = { key: string; label: string };

/**
 * Anatomically conventional colours - red arteries, blue veins, yellow nerves - so the model
 * reads the way a textbook plate does. Bone keeps its texture where the source has one; the
 * tint below only shows through on structures whose texture was stripped or absent.
 */
export const SYSTEM_COLOURS: Record<string, string> = {
  bone: "#ece4d4",
  muscle: "#a83f3f",
  artery: "#c0392b",
  vein: "#2f5d9e",
  nerve: "#e3c13c",
  connective: "#cfc4a8",
  other: "#b9bec4",
};

/**
 * Self-hosted Draco decoder, copied from three's distribution by `npm run anatomy:decoder`.
 * Must stay same-origin: connect-src does not allow gstatic, drei's default source.
 */
const DRACO_DECODER_PATH = "/draco/";

/** Reads clearly against every default above, including the reds. */
const SELECTED_COLOUR = new THREE.Color("#18b59b");
const HOVER_COLOUR = new THREE.Color("#5fd8c4");

export type ViewState = {
  selectedId: string | null;
  hoveredId: string | null;
  hiddenSystems: Set<string>;
  ghostSystems: Set<string>;
  systemOpacity: Record<string, number>;
  isolatedId: string | null;
};

type MeshRecord = { mesh: THREE.Mesh; system: string; baseColour: THREE.Color; hasTexture: boolean };

function Model({
  url, view, onSelect, onHover, onReady, focusRef,
}: {
  url: string;
  view: ViewState;
  onSelect: (s: AnatomyStructure | null) => void;
  onHover: (s: AnatomyStructure | null) => void;
  onReady: (info: { structures: AnatomyStructure[]; triangles: number }) => void;
  focusRef: React.RefObject<((id: string | null) => void) | null>;
}) {
  // Draco decoding, from a decoder we host ourselves.
  //
  // The models are Draco-compressed by scripts/anatomy/prepare-model.mjs because leaving
  // them uncompressed cost 95 MB of geometry across the regions - upper-limb alone was
  // 31.2 MB against 4.2 MB compressed, which is the difference between a usable and an
  // unusable download on a slow mobile connection.
  //
  // Passing the path as a string stops drei fetching the decoder from gstatic, which our
  // connect-src does not allow; /draco/ is copied from three's own distribution at the
  // matching version, so decoder and loader cannot drift apart. Compiling that decoder needs
  // 'wasm-unsafe-eval', which next.config.ts grants to the /anatomy routes only - it permits
  // WebAssembly compilation, not the string-to-code evaluation that 'unsafe-eval' allows.
  // (Phrased without the literal call syntax on purpose: scripts/security-static-audit.mjs
  // scans source text, so spelling it out here would trip the dynamic-code check.)
  //
  // useMeshopt stays false: nothing in the pipeline emits EXT_meshopt_compression, so
  // enabling it would only pull in a second decoder for no benefit.
  const { scene } = useGLTF(url, DRACO_DECODER_PATH, false);
  const { camera, controls } = useThree();

  // Clone the cached scene and give every mesh its own material, so recolouring or fading one
  // structure cannot bleed into its neighbours.
  const { model, records } = useMemo(() => {
    const root = scene.clone(true);
    const list: MeshRecord[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = object.material as THREE.MeshStandardMaterial;
      const material = source.clone();
      const system = (object.userData?.system as string) ?? "other";
      const hasTexture = Boolean(material.map);
      // Where the source ships a texture, keep it and leave the colour white so the texture
      // is not tinted into mud. Where it does not, the system colour is all we have.
      const baseColour = hasTexture ? new THREE.Color("#ffffff") : new THREE.Color(SYSTEM_COLOURS[system] ?? SYSTEM_COLOURS.other);
      material.color.copy(baseColour);
      material.transparent = false;
      material.opacity = 1;
      material.side = THREE.FrontSide;
      object.material = material;
      object.renderOrder = 0;
      // Stash the original map now, so the highlight swap below can put it back.
      material.userData.sourceMap = material.map ?? null;
      list.push({ mesh: object, system, baseColour, hasTexture });
    });
    return { model: root, records: list };
  }, [scene]);

  const structures = useMemo(() => records
    .filter((r) => r.mesh.userData?.structureName)
    .map((r) => ({
      id: r.mesh.userData.structureName as string,
      name: r.mesh.userData.structureName as string,
      system: r.system,
    })), [records]);

  useEffect(() => {
    let triangles = 0;
    for (const r of records) triangles += (r.mesh.geometry.index?.count ?? 0) / 3;
    onReady({ structures, triangles });
  }, [records, structures, onReady]);

  // Apply visibility, ghosting and selection in one pass whenever view state changes.
  useEffect(() => {
    for (const record of records) {
      const { mesh, system, baseColour, hasTexture } = record;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const id = mesh.userData?.structureName as string | undefined;

      const isolatedAway = view.isolatedId !== null && id !== view.isolatedId;
      mesh.visible = !view.hiddenSystems.has(system) && !isolatedAway;

      const selected = id !== undefined && id === view.selectedId;
      const hovered = id !== undefined && id === view.hoveredId;

      if (selected) material.color.copy(SELECTED_COLOUR);
      else if (hovered) material.color.copy(HOVER_COLOUR);
      else material.color.copy(baseColour);
      // A tinted highlight would be invisible on a textured bone, so drop the map while the
      // structure is selected or hovered and put it straight back afterwards.
      material.map = (selected || hovered) && hasTexture ? null : (material.userData.sourceMap as THREE.Texture | null);

      const ghosted = view.ghostSystems.has(system) && !selected;
      const opacity = ghosted ? (view.systemOpacity[system] ?? 0.25) : 1;
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
      mesh.renderOrder = opacity < 1 ? 1 : 0;
      material.needsUpdate = true;
    }
  }, [records, view]);

  /**
   * Frame the camera on one structure. Uses the mesh's world bounding sphere so the distance
   * suits the thing being looked at - a phalanx and a femur need very different framing.
   */
  useEffect(() => {
    focusRef.current = (id: string | null) => {
      const orbit = controls as OrbitControlsImpl | null;
      if (!orbit) return;
      const record = id ? records.find((r) => r.mesh.userData?.structureName === id) : null;
      const box = new THREE.Box3();
      if (record) box.setFromObject(record.mesh);
      else box.setFromObject(model);
      if (box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const distance = (sphere.radius / Math.sin(fov / 2)) * 1.6;
      const direction = new THREE.Vector3().subVectors(camera.position, orbit.target).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);
      orbit.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(direction, Math.max(distance, 0.05));
      orbit.update();
    };
    return () => { focusRef.current = null; };
  }, [records, model, camera, controls, focusRef]);

  /**
   * Frame the whole model once it is loaded, and scale the orbit limits to its actual size.
   * Open3Dmodel meshes are in real-world units and are not centred on the origin, so a fixed
   * camera position shows a limb hanging off the edge of frame. Fitting is done from the
   * bounding sphere so it works for any region without per-model tuning.
   */
  useEffect(() => {
    const orbit = controls as OrbitControlsImpl | null;
    if (!orbit) return;
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const perspective = camera as THREE.PerspectiveCamera;
    const distance = (sphere.radius / Math.sin((perspective.fov * Math.PI) / 180 / 2)) * 1.25;
    orbit.target.copy(sphere.center);
    camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + distance);
    // Near/far and the orbit limits all key off the model's own scale, so a hand and a whole
    // skeleton both behave sensibly.
    perspective.near = Math.max(sphere.radius / 1000, 0.001);
    perspective.far = sphere.radius * 100;
    perspective.updateProjectionMatrix();
    orbit.minDistance = sphere.radius * 0.05;
    orbit.maxDistance = sphere.radius * 12;
    orbit.update();
  }, [model, camera, controls]);

  // Materials cloned above are ours to dispose. Geometries and textures belong to the loader
  // cache and are released by the parent through useGLTF.clear.
  useEffect(() => () => {
    for (const r of records) (r.mesh.material as THREE.Material).dispose();
  }, [records]);

  const structureFrom = (object: THREE.Object3D): AnatomyStructure | null => {
    const id = object.userData?.structureName as string | undefined;
    if (!id) return null;
    return { id, name: id, system: (object.userData?.system as string) ?? "other" };
  };

  return (
    <primitive
      object={model}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const s = structureFrom(e.object);
        if (s) onSelect(s.id === view.selectedId ? null : s);
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(structureFrom(e.object)); }}
      onPointerOut={() => onHover(null)}
      onPointerMissed={() => onSelect(null)}
    />
  );
}

/**
 * Image-based lighting built from Lightformers rather than a preset HDRI.
 *
 * drei's `<Environment preset="...">` downloads its HDR from a CDN, which our CSP blocks -
 * it would work in dev and silently fail in production. Generating the environment in-scene
 * gives the same soft studio falloff with no network request at all.
 */
function Lighting() {
  return (
    <>
      <Environment resolution={256}>
        {/* Broad key from front-left, the main shaper. */}
        <Lightformer intensity={2.4} position={[-3, 2, 4]} scale={[8, 8, 1]} form="rect" color="#ffffff" />
        {/* Cool rim from behind to separate silhouettes from the background. */}
        <Lightformer intensity={1.5} position={[4, 1, -4]} scale={[6, 6, 1]} form="rect" color="#cfe0ff" />
        {/* Warm bounce from below so undersides do not go black. */}
        <Lightformer intensity={0.8} position={[0, -4, 1]} scale={[8, 4, 1]} form="rect" color="#ffe6cc" />
        {/* Overhead wrap. */}
        <Lightformer intensity={1.2} position={[0, 5, 0]} scale={[6, 6, 1]} form="circle" color="#ffffff" />
      </Environment>
      {/* A single crisp key on top of the IBL, for specular definition and shadow direction. */}
      <directionalLight position={[4, 6, 5]} intensity={1.1} color="#fff6ec" />
      <directionalLight position={[-5, 2, -3]} intensity={0.35} color="#dce8ff" />
      <ambientLight intensity={0.15} />
    </>
  );
}

function FrameMeter({ onSample }: { onSample: (fps: number, calls: number, triangles: number) => void }) {
  const { gl } = useThree();
  const frames = useRef(0);
  // Seeded on the first frame: reading the clock during render is impure.
  const since = useRef(0);
  // gl.info.render resets on every render pass, and <Environment> renders the lightformers
  // into a cubemap as a separate pass. Reading it instantaneously therefore sometimes catches
  // that pass instead of the scene - which is how "251 draw calls" gets reported as 3. Taking
  // the peak across the interval always lands on the main scene pass.
  const peakCalls = useRef(0);
  const peakTriangles = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (since.current === 0) { since.current = now; return; }
    frames.current += 1;
    if (gl.info.render.calls > peakCalls.current) peakCalls.current = gl.info.render.calls;
    if (gl.info.render.triangles > peakTriangles.current) peakTriangles.current = gl.info.render.triangles;
    if (now - since.current < 500) return;
    onSample(Math.round((frames.current * 1000) / (now - since.current)), peakCalls.current, peakTriangles.current);
    frames.current = 0;
    peakCalls.current = 0;
    peakTriangles.current = 0;
    since.current = now;
  });
  return null;
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="anatomy-viewer__loading" role="status" aria-live="polite">
      <div className="anatomy-viewer__bar"><i style={{ width: `${Math.round(progress)}%` }} /></div>
      <p>Loading model… {Math.round(progress)}%</p>
    </div>
  );
}

export default function AnatomyViewer({
  url, title, systems, removedTextures = [], debug = false,
}: {
  url: string;
  title: string;
  systems: AnatomySystem[];
  removedTextures?: string[];
  debug?: boolean;
}) {
  const [structures, setStructures] = useState<AnatomyStructure[]>([]);
  const [selected, setSelected] = useState<AnatomyStructure | null>(null);
  const [hovered, setHovered] = useState<AnatomyStructure | null>(null);
  const [hiddenSystems, setHiddenSystems] = useState<Set<string>>(new Set());
  const [ghostSystems, setGhostSystems] = useState<Set<string>>(new Set());
  const [systemOpacity, setSystemOpacity] = useState<Record<string, number>>({});
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ triangles: 0, drawCalls: 0, fps: 0, memory: 0 });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const focusRef = useRef<((id: string | null) => void) | null>(null);

  const handleReady = useCallback(({ structures: list, triangles }: { structures: AnatomyStructure[]; triangles: number }) => {
    setStructures(list);
    setStats((prev) => ({ ...prev, triangles }));
  }, []);

  const handleSample = useCallback((fps: number, calls: number, triangles: number) => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    setStats({ fps, drawCalls: calls, triangles, memory: memory ? memory.usedJSHeapSize / 1048576 : 0 });
  }, []);

  useEffect(() => () => { useGLTF.clear(url); }, [url]);

  const view: ViewState = useMemo(() => ({
    selectedId: selected?.id ?? null,
    hoveredId: hovered?.id ?? null,
    hiddenSystems,
    ghostSystems,
    systemOpacity,
    isolatedId,
  }), [selected, hovered, hiddenSystems, ghostSystems, systemOpacity, isolatedId]);

  const focusOn = useCallback((id: string | null) => { focusRef.current?.(id); }, []);

  const resetView = useCallback(() => {
    setSelected(null);
    setIsolatedId(null);
    setHiddenSystems(new Set());
    setGhostSystems(new Set());
    setSystemOpacity({});
    focusRef.current?.(null);
  }, []);

  return (
    <div className="anatomy-viewer">
      <div
        className="anatomy-viewer__stage"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      >
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 0, 3], fov: 40, near: 0.01, far: 500 }}
          gl={{ antialias: true, toneMappingExposure: 1.05 }}
          onCreated={({ gl, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            scene.background = new THREE.Color("#0f1216");
          }}
        >
          <Lighting />
          <Model
            url={url}
            view={view}
            onSelect={(s) => { setSelected(s); if (!s) setIsolatedId(null); }}
            onHover={setHovered}
            onReady={handleReady}
            focusRef={focusRef}
          />
          <OrbitControls
            makeDefault
            enablePan
            enableZoom
            enableRotate
            enableDamping
            dampingFactor={0.08}
            // min/maxDistance are set from the model's bounding sphere once it loads, so the
            // limits suit a hand and a whole skeleton alike.
          />
          {debug ? <FrameMeter onSample={handleSample} /> : null}
        </Canvas>

        <LoadingOverlay />

        {hovered && hovered.id !== selected?.id ? (
          <div className="anatomy-tooltip" style={{ left: pointer.x + 14, top: pointer.y + 14 }} aria-hidden="true">
            <i style={{ background: SYSTEM_COLOURS[hovered.system] ?? SYSTEM_COLOURS.other }} />
            {hovered.name}
          </div>
        ) : null}

        <div className="anatomy-viewer__toolbar">
          <button type="button" onClick={resetView}>Reset view</button>
          <button type="button" onClick={() => focusOn(selected?.id ?? null)} disabled={!selected}>Focus</button>
          <button
            type="button"
            className={isolatedId ? "is-active" : undefined}
            onClick={() => setIsolatedId(isolatedId ? null : selected?.id ?? null)}
            disabled={!selected && !isolatedId}
          >
            {isolatedId ? "Show all" : "Isolate"}
          </button>
        </div>

        <div className="anatomy-viewer__readout" aria-live="polite">
          {selected
            ? <><i style={{ background: SYSTEM_COLOURS[selected.system] ?? SYSTEM_COLOURS.other }} /><strong>{selected.name}</strong></>
            : (
              <span className="anatomy-viewer__hint">
                <span className="anatomy-viewer__hint--fine">Click a structure to select it. Drag to orbit, scroll to zoom, right-drag to pan.</span>
                <span className="anatomy-viewer__hint--coarse">Tap a structure to select it. Drag to orbit, pinch to zoom, two-finger drag to pan.</span>
              </span>
            )}
        </div>

        {debug ? (
          <dl className="anatomy-viewer__stats">
            <div><dt>FPS</dt><dd>{stats.fps}</dd></div>
            <div><dt>Draw calls</dt><dd>{stats.drawCalls}</dd></div>
            <div><dt>Triangles</dt><dd>{stats.triangles.toLocaleString()}</dd></div>
            <div><dt>JS heap</dt><dd>{stats.memory ? `${stats.memory.toFixed(0)} MB` : "n/a"}</dd></div>
          </dl>
        ) : null}
      </div>

      <AnatomyControls
        title={title}
        systems={systems}
        structures={structures}
        selectedId={selected?.id ?? null}
        hiddenSystems={hiddenSystems}
        ghostSystems={ghostSystems}
        systemOpacity={systemOpacity}
        onSelect={(s) => { setSelected(s); if (s) focusOn(s.id); }}
        onToggleSystem={(key) => setHiddenSystems((prev) => {
          const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next;
        })}
        onToggleGhost={(key) => setGhostSystems((prev) => {
          const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next;
        })}
        onOpacity={(key, value) => setSystemOpacity((prev) => ({ ...prev, [key]: value }))}
        footer={<AnatomyAttribution removedTextures={removedTextures} compact />}
      />
    </div>
  );
}

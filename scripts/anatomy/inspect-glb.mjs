#!/usr/bin/env node
/**
 * Report what a .glb actually contains: structure names, materials, and embedded textures.
 *
 *   node anatomy/inspect-glb.mjs <file.glb | directory>
 *
 * Written mainly to answer two questions about third-party models before building on them:
 * are the object names meaningful enough to use as anatomical labels, and are there embedded
 * textures whose licence differs from the model's?
 */

import { readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const target = process.argv[2];
if (!target) { console.error("usage: inspect-glb.mjs <file.glb | directory>"); process.exit(1); }

function collect(path) {
  if (statSync(path).isFile()) return extname(path).toLowerCase() === ".glb" ? [path] : [];
  return readdirSync(path).flatMap((entry) => collect(join(path, entry)));
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of collect(target)) {
  const doc = await io.read(file);
  const root = doc.getRoot();

  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      triangles += (indices ? indices.getCount() : prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    }
  }

  const named = root.listNodes().filter((n) => n.getMesh() && n.getName());
  const textures = root.listTextures();

  console.log(`\n=== ${basename(file)} (${(statSync(file).size / 1048576).toFixed(2)} MB) ===`);
  console.log(`meshes ${root.listMeshes().length}  nodes-with-mesh ${named.length}  triangles ${Math.round(triangles).toLocaleString()}`);
  console.log(`materials ${root.listMaterials().length}  textures ${textures.length}`);
  const copyright = root.getAsset().copyright;
  if (copyright) console.log(`copyright: ${copyright}`);
  console.log(`generator: ${root.getAsset().generator ?? "(none)"}`);

  if (textures.length) {
    console.log("textures:");
    for (const t of textures) {
      const image = t.getImage();
      console.log(`   ${(t.getName() || "(unnamed)").padEnd(34)} ${t.getMimeType() || "?"}  ${image ? `${(image.byteLength / 1024).toFixed(0)} kB` : "no image"}  uri=${t.getURI() || "(embedded)"}`);
    }
  }

  console.log(`sample structure names (${named.length} total):`);
  for (const n of named.slice(0, 12)) console.log(`   ${n.getName()}`);
  if (named.length > 12) console.log(`   ... and ${named.length - 12} more`);
}

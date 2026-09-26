# Third-Party Licenses and 3D Anatomy Attribution

Last reviewed: 2026-09-18

This notice records the third-party 3D anatomy material distributed by **My Doctor & The Professor**. It is an attribution and redistribution record for those assets; it does **not** grant a license to unrelated application code, branding, course content, question banks, or other client-owned material.

## Open3DModel anatomy assets

The production anatomy viewer uses adapted assets from the **Open3DModel / AnatomyTOOL** project.

- Project/source collection: https://anatomytool.org/open3dmodel-create
- Open3DModel information: https://anatomytool.org/open3dmodel
- Source archive host used by the asset pipeline: https://caskanatomy.info/open3dmodelfiles
- Open3DModel source records identify the model family under **Creative Commons Attribution-ShareAlike (CC BY-SA)**.
- The adapted production model files in this project are marked and redistributed under **CC BY-SA 4.0**:
  https://creativecommons.org/licenses/by-sa/4.0/
- CC BY-SA 4.0 legal code:
  https://creativecommons.org/licenses/by-sa/4.0/legalcode

The Open3DModel work is credited to the **Open3D project and the creators / institutions identified on the corresponding AnatomyTOOL item pages**. Individual item creator lists vary by model and should be preserved through the linked source records.

### Model packages used in this deployment

| My Doctor Professor asset | Open3DModel source package | Source work / region | Production adaptation |
| --- | --- | --- | --- |
| `anatomy/skeleton.glb` | `overview-skeleton` | Open3DModel — Skeleton | CC BY-SA 4.0 |
| `anatomy/skull.glb` | `overview-colored-skull` | Open3DModel — Skull | CC BY-SA 4.0 |
| `anatomy/skull-exploded.glb` | `exploded-view-skull` | Open3DModel — Exploded view skull | CC BY-SA 4.0 |
| `anatomy/skull-base.glb` | `colored-skull-base` | Open3DModel — Skull base | CC BY-SA 4.0 |
| `anatomy/vertebrae.glb` | `vertebrae` | Open3DModel — Vertebrae | CC BY-SA 4.0 |
| `anatomy/upper-limb.glb` | `upper-limb` | Open3DModel — Upper limb | CC BY-SA 4.0 |
| `anatomy/lower-limb.glb` | `lower-limb` | Open3DModel — Lower limb | CC BY-SA 4.0 |
| `anatomy/hand.glb` | `hand` | Open3DModel — Hand / wrist | CC BY-SA 4.0 |

Before replacing any source package, verify the license and creator attribution shown on the exact AnatomyTOOL item page and update this register if they differ. Do not assume that a newly downloaded AnatomyTOOL item has identical terms merely because it is from the same platform.

## Changes made by My Doctor Professor

The production `.glb` files are adapted for web delivery. Depending on the region, the asset pipeline performs the following changes:

- decodes the source Draco mesh before editing and re-encodes the final model with Draco compression;
- simplifies mesh geometry for practical web/mobile delivery;
- mirrors one-sided bilateral structures where the upstream model intentionally supplies only one side;
- normalizes structure names for display;
- adds system classification and structure metadata used by the interactive viewer;
- adds an embedded copyright / attribution notice to the glTF asset metadata;
- removes the non-commercial textures listed below; and
- renders affected surfaces using flat color instead of the removed texture.

These modifications to the Open3DModel-derived assets are redistributed under **CC BY-SA 4.0**.

## Non-commercial textures intentionally excluded

Some upstream limb/hand packages contain muscle texture material identified by the project as **CC BY-NC-SA**. The commercial production pipeline removes these texture assets and does not redistribute them:

- `Muscle tiles`
- `Muscle tiles plain`
- `Muscle long tendons`
- `Tendon only`

The production publishing and deployment checks are designed to fail if any of those texture names are present in a released model.

CC BY-NC-SA 4.0 does not permit use for commercial purposes:
https://creativecommons.org/licenses/by-nc-sa/4.0/

## Upstream derivative chain

Open3DModel is based in part on earlier open anatomy work. The viewer preserves this attribution chain.

### Z-Anatomy

- Project: https://github.com/Z-Anatomy/Models-of-human-anatomy
- License: **CC BY-SA 4.0**
- Upstream license file: https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt

### BodyParts3D

- Attribution party: **The Database Center for Life Science (DBCLS)**
- Project description: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html
- The historical derivative chain used by Z-Anatomy / Open3DModel identifies predecessor BodyParts3D material under **CC BY-SA 2.1 Japan**:
  https://creativecommons.org/licenses/by-sa/2.1/jp/

BodyParts3D's current distribution terms may differ from the historical license under which predecessor material entered this derivative chain. This notice preserves the attribution/license chain stated by the upstream derivative projects rather than attempting to retroactively relicense those predecessor contributions.

## ShareAlike scope

The adapted Open3DModel-derived model files remain under CC BY-SA 4.0 and may be shared or adapted, including commercially, subject to that license's attribution and ShareAlike requirements.

The presence of those assets in the application does not by itself relicense separate, independent application code or other client-owned material. Any redistribution of the adapted model files must preserve the applicable Creative Commons rights and notices.

Nothing in the platform Terms of Service is intended to impose additional restrictions on rights granted by the Creative Commons licenses for these third-party assets.

## Viewer implementation

The My Doctor Professor anatomy UI is implemented with **Three.js / React Three Fiber / Drei**. It does not use the AnatomyTOOL Open3D webviewer as its runtime viewer. The AnatomyTOOL/Open3D webviewer is a separate GPL-3.0 project; that viewer license is separate from the Creative Commons licenses on the model assets.

## No endorsement

Attribution does not imply that AnatomyTOOL, the Open3D project, Z-Anatomy, DBCLS, their contributors, or their affiliated institutions endorse My Doctor Professor or this use of the material.

## Operational requirement

Every production anatomy release should include a copy of this notice next to the model files. The release pipeline verifies the expected Open3DModel / AnatomyTOOL / CC BY-SA metadata and rejects known non-commercial texture payloads before publication.

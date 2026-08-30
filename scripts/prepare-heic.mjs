// Copy the pinned, CSP-safe decoder without bundling it into the Worker.
// It is loaded only by Studio, when the user actually selects a HEIC photo.
import { mkdir, copyFile, writeFile } from "node:fs/promises";
await mkdir(new URL("../public/vendor/", import.meta.url), { recursive: true });
await copyFile(new URL("../node_modules/heic-to/dist/csp/heic-to.min.js", import.meta.url), new URL("../public/vendor/heic-to.js", import.meta.url));
await copyFile(new URL("../node_modules/heic-to/LICENSE", import.meta.url), new URL("../public/vendor/heic-to.LICENSE", import.meta.url));
await writeFile(new URL("../public/vendor/heic-to.SOURCE.txt", import.meta.url), "heic-to 1.5.2 (LGPL-3.0)\nhttps://github.com/hoppergee/heic-to/tree/v1.5.2\nUses libheif and libde265; source and rebuild instructions: https://github.com/hoppergee/heic-to\nThe CSP build is distributed unmodified.\n");

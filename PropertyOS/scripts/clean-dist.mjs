import { rmSync } from "node:fs";
// dist is generated output only. Records are held by the storage adapters, never here.
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });

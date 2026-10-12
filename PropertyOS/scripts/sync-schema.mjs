import { readFileSync, writeFileSync } from "node:fs";
writeFileSync(
  "src/core/schema.ts",
  "// Generated from schema.sql.\nexport default " +
    JSON.stringify(readFileSync("src/core/schema.sql", "utf8")) +
    ";\n",
);

/** Run after validation. Produces a source + built-web zip with no records/test artifacts. */
import { spawnSync } from "node:child_process";
const code = String.raw`
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path.cwd()
output=root.parent/'PropertyOS_v0.2_GitHub_Vercel.zip'
partial=output.with_suffix('.zip.tmp')
excluded={'node_modules','.git','.vercel','release','target','test-results','playwright-report','__pycache__'}
with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=7) as archive:
 for file in sorted(root.rglob('*')):
  rel=file.relative_to(root)
  if not file.is_file() or any(p in excluded for p in rel.parts): continue
  if file.name.startswith('.env') and file.name != '.env.example': continue
  if file.suffix == '.log': continue
  if file.suffix in ('.posvault','.sqlite','.pyc'): continue
  archive.write(file,Path('PropertyOS')/rel)
with ZipFile(partial) as verify:
 if verify.testzip() is not None: raise RuntimeError('Archive integrity check failed')
partial.replace(output)
print(output)
`;
const result = spawnSync("python3", ["-c", code], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);

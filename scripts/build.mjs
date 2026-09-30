import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";

const outputDirectory = "dist";
const assetsDirectory = `${outputDirectory}/assets`;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(assetsDirectory, { recursive: true });

const result = await build({
  entryPoints: ["src/main.js", "src/solver-worker.js"],
  outdir: assetsDirectory,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  metafile: true,
});

async function fingerprint(path) {
  const content = await readFile(path);
  const extension = extname(path);
  const name = path.slice(0, -extension.length);
  const fingerprint = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 12);
  const fingerprintedPath = `${name}-${fingerprint}${extension}`;
  await writeFile(fingerprintedPath, content);
  await rm(path);
  return fingerprintedPath;
}

const workerPath = await fingerprint(`${assetsDirectory}/solver-worker.js`);
const mainPath = `${assetsDirectory}/main.js`;
let main = await readFile(mainPath, "utf8");
main = main.replaceAll("./solver-worker.js", `./${basename(workerPath)}`);
await writeFile(mainPath, main);
const fingerprintedMainPath = await fingerprint(mainPath);

const mainOutput = result.metafile.outputs[mainPath];
const cssPath = mainOutput?.cssBundle
  ? await fingerprint(mainOutput.cssBundle)
  : "";
let html = await readFile("index.html", "utf8");
html = html.replace(
  'src="./src/main.js"',
  `src="./${fingerprintedMainPath.replace(`${outputDirectory}/`, "")}"`,
);
if (cssPath) {
  html = html.replace(
    "</head>",
    `    <link rel="stylesheet" href="./${cssPath.replace(`${outputDirectory}/`, "")}" />\n  </head>`,
  );
}
await writeFile(`${outputDirectory}/index.html`, html);

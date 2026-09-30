import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

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

const mainOutput = result.metafile.outputs[`${assetsDirectory}/main.js`];
const cssPath = mainOutput?.cssBundle?.replace(`${outputDirectory}/`, "./") ?? "";
let html = await readFile("index.html", "utf8");
html = html.replace('src="./src/main.js"', 'src="./assets/main.js"');
if (cssPath) {
  html = html.replace("</head>", `    <link rel="stylesheet" href="${cssPath}" />\n  </head>`);
}
await writeFile(`${outputDirectory}/index.html`, html);

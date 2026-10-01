import { readFile } from "node:fs/promises";

const workflow = await readFile(".github/workflows/review-gate.yml", "utf8");
const scriptMarker = "          script: |\n";
const scriptStart = workflow.indexOf(scriptMarker);

if (scriptStart === -1) {
  throw new Error(
    "Review gate must contain an embedded GitHub Actions script.",
  );
}

const script = workflow
  .slice(scriptStart + scriptMarker.length)
  .split("\n")
  .filter((line) => line.startsWith("            "))
  .map((line) => line.slice(12))
  .join("\n");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runReviewGate = new AsyncFunction("github", "context", "core", script);

const cursors = [];
const failures = [];
await runReviewGate(
  {
    rest: {
      checks: {
        listForRef: async () => ({
          data: {
            check_runs: [
              {
                name: "copilot-pull-request-reviewer",
                status: "completed",
                conclusion: "success",
              },
            ],
          },
        }),
      },
    },
    graphql: async (_query, { cursor }) => {
      cursors.push(cursor);
      const firstPage = cursor === null;
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [{ isResolved: firstPage }],
              pageInfo: {
                endCursor: firstPage ? "second-page" : null,
                hasNextPage: firstPage,
              },
            },
          },
        },
      };
    },
  },
  { repo: { owner: "octo", repo: "solver" }, issue: { number: 1 } },
  { setFailed: (message) => failures.push(message) },
);

if (cursors.join(",") !== ",second-page") {
  throw new Error("Review gate did not request every page of review threads.");
}
if (
  failures[0] !== "Resolve every review thread before requesting auto-merge."
) {
  throw new Error(
    "Review gate did not fail for an unresolved later-page thread.",
  );
}

console.log(
  "Review gate compiles, waits for Copilot, and paginates review threads.",
);

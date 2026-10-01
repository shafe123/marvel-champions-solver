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
let threadPoll = 0;
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback) => {
  callback();
  return 0;
};

try {
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
        if (cursor === null) {
          threadPoll += 1;
        }
        const firstPage = cursor === null;
        const unresolvedLaterPage = threadPoll === 1 && !firstPage;
        return {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [{ isResolved: !unresolvedLaterPage }],
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
} finally {
  globalThis.setTimeout = originalSetTimeout;
}

if (cursors.join(",") !== ",second-page,,second-page") {
  throw new Error("Review gate did not request every page of review threads.");
}
if (failures.length > 0) {
  throw new Error(
    "Review gate did not wait for an unresolved later-page thread.",
  );
}

console.log(
  "Review gate compiles, waits for Copilot, and retries paginated review threads.",
);

import { readFile } from "node:fs/promises";
import { parseNames } from "../src/catalog-input.js";
import { validateLocks } from "../src/locks.js";

const parsedVillains = parseNames("Loki\nLoki, God of Lies");
if (parsedVillains.length !== 2 || parsedVillains[1] !== "Loki, God of Lies") {
  throw new Error("Roster parsing must preserve commas in names.");
}

let messageListener;
globalThis.self = {
  addEventListener(type, listener) {
    if (type === "message") {
      messageListener = listener;
    }
  },
  postMessage(message) {
    responses.push(message);
  },
};

await import("../src/solver-worker.js");
const catalog = JSON.parse(await readFile("catalog.json", "utf8"));
const responses = [];

async function solve(options = {}) {
  const initialResponses = responses.length;
  await messageListener({ data: { type: "solve", catalog, ...options } });
  const response = responses[initialResponses];
  if (response?.type !== "solution") {
    throw new Error(response?.message ?? "Browser worker did not return a solution.");
  }
  return response.assignments;
}

async function solveFailure(options = {}) {
  const initialResponses = responses.length;
  await messageListener({ data: { type: "solve", catalog, ...options } });
  const response = responses[initialResponses];
  if (response?.type !== "error") {
    throw new Error("Browser worker accepted conflicting locks.");
  }
  return response.message;
}

function validate(assignments) {
  if (assignments.length !== catalog.villains.length) {
    throw new Error("Browser worker returned an incomplete solution.");
  }
  if (
    assignments.some(
      (assignment, index) =>
        assignment.villain !== catalog.villains[index] ||
        JSON.stringify(Object.keys(assignment.players)) !== JSON.stringify(catalog.players),
    )
  ) {
    throw new Error("Browser worker did not preserve the displayed villain and player order.");
  }

  const playerHeroes = new Map(catalog.players.map((player) => [player, new Set()]));
  const heroAspects = new Set();
  for (const assignment of assignments) {
    const scenarioHeroes = new Set();
    for (const [player, choice] of Object.entries(assignment.players)) {
      if (playerHeroes.get(player).has(choice.hero)) {
        throw new Error(`${player} reused ${choice.hero}.`);
      }
      if (heroAspects.has(`${choice.hero}\0${choice.aspect}`)) {
        throw new Error(`${choice.hero} reused ${choice.aspect}.`);
      }
      if (scenarioHeroes.has(choice.hero)) {
        throw new Error(`${assignment.villain} contains ${choice.hero} more than once.`);
      }
      playerHeroes.get(player).add(choice.hero);
      heroAspects.add(`${choice.hero}\0${choice.aspect}`);
      scenarioHeroes.add(choice.hero);
    }
  }
}

const deterministicSolution = await solve();
validate(deterministicSolution);
const repeatedDeterministicSolution = await solve();
if (JSON.stringify(deterministicSolution) !== JSON.stringify(repeatedDeterministicSolution)) {
  throw new Error("Normal browser-worker generation must remain deterministic.");
}

const randomizedSolutions = new Set();
for (const randomSeed of [1, 2, 3, 4, 5]) {
  const assignments = await solve({ randomize: true, randomSeed });
  validate(assignments);
  randomizedSolutions.add(JSON.stringify(assignments));
}
if (randomizedSolutions.size < 2) {
  throw new Error("Randomized browser-worker generation did not vary across fixed model orders.");
}

const locks = [
  {
    villain: "Rhino",
    player: "Player 1",
    hero: "Spider-Man (Peter Parker)",
    aspect: "Justice",
  },
];
const partiallyLockedSolution = await solve({ locks, randomize: true, randomSeed: 6 });
validate(partiallyLockedSolution);
const rhino = partiallyLockedSolution.find((assignment) => assignment.villain === "Rhino");
if (rhino.players["Player 1"].hero !== locks[0].hero || rhino.players["Player 1"].aspect !== locks[0].aspect) {
  throw new Error("Browser worker did not preserve a valid locked assignment.");
}

const conflicts = [
  {
    villain: "Rhino",
    player: "Player 1",
    hero: "Spider-Man (Peter Parker)",
    aspect: "Justice",
  },
  {
    villain: "Rhino",
    player: "Player 1",
    hero: "Captain Marvel",
    aspect: "Aggression",
  },
  {
    villain: "Klaw",
    player: "Player 1",
    hero: "Spider-Man (Peter Parker)",
    aspect: "Leadership",
  },
  {
    villain: "Ultron",
    player: "Player 2",
    hero: "Spider-Man (Peter Parker)",
    aspect: "Justice",
  },
  {
    villain: "Rhino",
    player: "Player 3",
    hero: "Spider-Man (Peter Parker)",
    aspect: "Protection",
  },
];
const conflictErrors = validateLocks(catalog, conflicts).join("\n");
for (const expected of ["duplicate slot", "cannot reuse", "already locked for", "heroes must differ"]) {
  if (!conflictErrors.includes(expected)) {
    throw new Error(`Lock validation did not report ${expected}.`);
  }
}
const workerConflict = await solveFailure({ locks: conflicts.slice(0, 2) });
if (!workerConflict.includes("duplicate slot")) {
  throw new Error("Browser worker did not return the actionable lock conflict.");
}

const infeasibleCatalog = {
  players: ["P0", "P1"],
  heroes: ["H0", "H1", "H2"],
  aspects: ["A0", "A1"],
  villains: ["V0", "V1", "V2"],
};
const infeasibleLocks = [
  { villain: "V0", player: "P0", hero: "H0", aspect: "A0" },
  { villain: "V1", player: "P0", hero: "H1", aspect: "A0" },
  { villain: "V2", player: "P1", hero: "H2", aspect: "A0" },
];
const infeasibleLockMessage = await solveFailure({
  catalog: infeasibleCatalog,
  locks: infeasibleLocks,
});
if (!infeasibleLockMessage.includes("cannot be completed")) {
  throw new Error("Browser worker did not explain an infeasible lock combination.");
}

const incompleteAndUnknownErrors = validateLocks(catalog, [
  { villain: "Unknown villain", player: "", hero: "Spider-Man (Peter Parker)", aspect: "Justice" },
]).join("\n");
for (const expected of ["unknown villain scenario", "choose a player"]) {
  if (!incompleteAndUnknownErrors.includes(expected)) {
    throw new Error(`Lock validation did not report ${expected}.`);
  }
}

console.log(
  `Browser worker solved ${deterministicSolution.length} scenarios, honored locks, and produced ${randomizedSolutions.size} randomized schedules.`,
);

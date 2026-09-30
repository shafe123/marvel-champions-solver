import { readFile } from "node:fs/promises";

let messageListener;
let response;
globalThis.self = {
  addEventListener(type, listener) {
    if (type === "message") {
      messageListener = listener;
    }
  },
  postMessage(message) {
    response = message;
  },
};

await import("../src/solver-worker.js");
const catalog = JSON.parse(await readFile("catalog.json", "utf8"));
await messageListener({ data: { type: "solve", catalog } });

if (response?.type !== "solution") {
  throw new Error(response?.message ?? "Browser worker did not return a solution.");
}
if (response.assignments.length !== catalog.villains.length) {
  throw new Error("Browser worker returned an incomplete solution.");
}

const playerHeroes = new Map(catalog.players.map((player) => [player, new Set()]));
const heroAspects = new Set();
for (const assignment of response.assignments) {
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

console.log(`Browser worker solved ${response.assignments.length} scenarios.`);

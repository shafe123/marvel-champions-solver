import GLPK from "glpk.js";
import { validateLocks } from "./locks.js";

const MAXIMUM_SOLVE_TIME_SECONDS = 30;
let glpkPromise;

function getGlpk() {
  glpkPromise ??= GLPK();
  return glpkPromise;
}

function variableName(villain, player, hero, aspect) {
  return `x_${villain}_${player}_${hero}_${aspect}`;
}

function addConstraint(model, name, variables, bounds) {
  model.subjectTo.push({
    name,
    vars: variables.map((name) => ({ name, coef: 1 })),
    bnds: bounds,
  });
}

function shuffledIndexes(length, random) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [indexes[index], indexes[selected]] = [indexes[selected], indexes[index]];
  }
  return indexes;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function buildModel(catalog, glpk, { locks = [], randomize = false, randomSeed } = {}) {
  const model = {
    name: "marvel-champions-assignment",
    objective: { direction: glpk.GLP_MIN, name: "objective", vars: [] },
    subjectTo: [],
    binaries: [],
  };
  const { players, heroes, aspects, villains } = catalog;
  const random = randomSeed === undefined ? Math.random : seededRandom(randomSeed);
  const indexes = (length) =>
    randomize ? shuffledIndexes(length, random) : Array.from({ length }, (_, index) => index);
  const villainIndexes = indexes(villains.length);
  const playerIndexes = indexes(players.length);
  const heroIndexes = indexes(heroes.length);
  const aspectIndexes = indexes(aspects.length);

  for (const villain of villainIndexes) {
    for (const player of playerIndexes) {
      for (const hero of heroIndexes) {
        for (const aspect of aspectIndexes) {
          model.binaries.push(variableName(villain, player, hero, aspect));
        }
      }
    }
  }

  for (const villain of villainIndexes) {
    for (const player of playerIndexes) {
      addConstraint(
        model,
        `assignment_${villain}_${player}`,
        heroIndexes.flatMap((hero) =>
          aspectIndexes.map((aspect) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_FX, lb: 1, ub: 1 },
      );
    }
  }

  for (const player of playerIndexes) {
    for (const hero of heroIndexes) {
      addConstraint(
        model,
        `player_hero_${player}_${hero}`,
        villainIndexes.flatMap((villain) =>
          aspectIndexes.map((aspect) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_UP, lb: 0, ub: 1 },
      );
    }
  }

  for (const hero of heroIndexes) {
    for (const aspect of aspectIndexes) {
      addConstraint(
        model,
        `hero_aspect_${hero}_${aspect}`,
        villainIndexes.flatMap((villain) =>
          playerIndexes.map((player) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_UP, lb: 0, ub: 1 },
      );
    }
  }

  for (const villain of villainIndexes) {
    for (const hero of heroIndexes) {
      addConstraint(
        model,
        `scenario_hero_${villain}_${hero}`,
        playerIndexes.flatMap((player) =>
          aspectIndexes.map((aspect) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_UP, lb: 0, ub: 1 },
      );
    }
  }

  for (const [index, lock] of locks.entries()) {
    addConstraint(
      model,
      `lock_${index}`,
      [variableName(
        villains.indexOf(lock.villain),
        players.indexOf(lock.player),
        heroes.indexOf(lock.hero),
        aspects.indexOf(lock.aspect),
      )],
      { type: glpk.GLP_FX, lb: 1, ub: 1 },
    );
  }

  return model;
}

function decodeAssignments(catalog, values) {
  const { players, heroes, aspects, villains } = catalog;
  return villains.map((villainName, villain) => {
    const assignments = {};
    for (let player = 0; player < players.length; player += 1) {
      let selected;
      for (let hero = 0; hero < heroes.length && !selected; hero += 1) {
        for (let aspect = 0; aspect < aspects.length; aspect += 1) {
          if (values[variableName(villain, player, hero, aspect)] > 0.5) {
            selected = { hero: heroes[hero], aspect: aspects[aspect] };
            break;
          }
        }
      }
      if (!selected) {
        throw new Error(`Solver did not assign ${players[player]} against ${villainName}.`);
      }
      assignments[players[player]] = selected;
    }
    return { villain: villainName, players: assignments };
  });
}

self.addEventListener("message", async ({ data }) => {
  if (data.type !== "solve") {
    return;
  }

  try {
    const lockErrors = validateLocks(data.catalog, data.locks);
    if (lockErrors.length > 0) {
      throw new Error(lockErrors.join(" "));
    }
    const glpk = await getGlpk();
    const result = await glpk.solve(buildModel(data.catalog, glpk, data), {
      msglev: glpk.GLP_MSG_OFF,
      presol: true,
      tmlim: MAXIMUM_SOLVE_TIME_SECONDS,
    });
    const solution = result?.result ?? result;
    if ([glpk.GLP_INFEAS, glpk.GLP_NOFEAS].includes(solution?.status)) {
      throw new Error(
        "The locked assignments and current roster cannot be completed. Change a lock, add heroes or aspects, or reduce the number of scenarios.",
      );
    }
    if (!solution || ![glpk.GLP_FEAS, glpk.GLP_OPT].includes(solution.status)) {
      throw new Error(
        `No solution was found within ${MAXIMUM_SOLVE_TIME_SECONDS} seconds. Try adding heroes or aspects, or reducing the roster.`,
      );
    }
    self.postMessage({
      type: "solution",
      assignments: decodeAssignments(data.catalog, solution.vars),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

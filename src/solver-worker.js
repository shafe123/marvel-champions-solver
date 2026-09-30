import GLPK from "glpk.js";

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

function buildModel(catalog, glpk) {
  const model = {
    name: "marvel-champions-assignment",
    objective: { direction: glpk.GLP_MIN, name: "objective", vars: [] },
    subjectTo: [],
    binaries: [],
  };
  const { players, heroes, aspects, villains } = catalog;

  for (let villain = 0; villain < villains.length; villain += 1) {
    for (let player = 0; player < players.length; player += 1) {
      for (let hero = 0; hero < heroes.length; hero += 1) {
        for (let aspect = 0; aspect < aspects.length; aspect += 1) {
          model.binaries.push(variableName(villain, player, hero, aspect));
        }
      }
    }
  }

  for (let villain = 0; villain < villains.length; villain += 1) {
    for (let player = 0; player < players.length; player += 1) {
      addConstraint(
        model,
        `assignment_${villain}_${player}`,
        heroes.flatMap((_, hero) =>
          aspects.map((_, aspect) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_FX, lb: 1, ub: 1 },
      );
    }
  }

  for (let player = 0; player < players.length; player += 1) {
    for (let hero = 0; hero < heroes.length; hero += 1) {
      addConstraint(
        model,
        `player_hero_${player}_${hero}`,
        villains.flatMap((_, villain) =>
          aspects.map((_, aspect) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_UP, lb: 0, ub: 1 },
      );
    }
  }

  for (let hero = 0; hero < heroes.length; hero += 1) {
    for (let aspect = 0; aspect < aspects.length; aspect += 1) {
      addConstraint(
        model,
        `hero_aspect_${hero}_${aspect}`,
        villains.flatMap((_, villain) =>
          players.map((_, player) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_UP, lb: 0, ub: 1 },
      );
    }
  }

  for (let villain = 0; villain < villains.length; villain += 1) {
    for (let hero = 0; hero < heroes.length; hero += 1) {
      addConstraint(
        model,
        `scenario_hero_${villain}_${hero}`,
        players.flatMap((_, player) =>
          aspects.map((_, aspect) => variableName(villain, player, hero, aspect)),
        ),
        { type: glpk.GLP_UP, lb: 0, ub: 1 },
      );
    }
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
    const glpk = await getGlpk();
    const result = await glpk.solve(buildModel(data.catalog, glpk), {
      msglev: glpk.GLP_MSG_OFF,
      presol: true,
      tmlim: MAXIMUM_SOLVE_TIME_SECONDS,
    });
    if (![glpk.GLP_FEAS, glpk.GLP_OPT].includes(result.result.status)) {
      throw new Error(
        `No solution was found within ${MAXIMUM_SOLVE_TIME_SECONDS} seconds. Try adding heroes or aspects, or reducing the roster.`,
      );
    }
    self.postMessage({
      type: "solution",
      assignments: decodeAssignments(data.catalog, result.result.vars),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

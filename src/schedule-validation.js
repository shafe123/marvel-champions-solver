function choiceAt(assignment, player) {
  return assignment?.players?.[player];
}

function lockLabel(lock) {
  return `${lock.player} against ${lock.villain}`;
}

export function validateSchedule(catalog, assignments, locks = []) {
  const errors = [];
  const expectedVillains = new Set(catalog.villains);
  const expectedPlayers = new Set(catalog.players);

  if (!Array.isArray(assignments)) {
    return ["The schedule must be a list of scenario assignments."];
  }
  if (assignments.length !== catalog.villains.length) {
    errors.push(
      `The schedule must contain ${catalog.villains.length} scenarios, but contains ${assignments.length}.`,
    );
  }

  const assignmentsByVillain = new Map();
  assignments.forEach((assignment, index) => {
    const villain = assignment?.villain;
    if (!expectedVillains.has(villain)) {
      errors.push(
        `Scenario ${index + 1} has unknown villain "${villain ?? ""}".`,
      );
      return;
    }
    if (assignmentsByVillain.has(villain)) {
      errors.push(`The schedule contains ${villain} more than once.`);
      return;
    }
    assignmentsByVillain.set(villain, assignment);

    if (!assignment.players || typeof assignment.players !== "object") {
      errors.push(`${villain} must include assignments for every player.`);
      return;
    }
    for (const player of Object.keys(assignment.players)) {
      if (!expectedPlayers.has(player)) {
        errors.push(`${villain} has an unknown player "${player}".`);
      }
    }
    for (const player of catalog.players) {
      const choice = choiceAt(assignment, player);
      if (!choice || typeof choice !== "object") {
        errors.push(`${villain} is missing an assignment for ${player}.`);
        continue;
      }
      if (!catalog.heroes.includes(choice.hero)) {
        errors.push(
          `${villain} assigns unknown hero "${choice.hero ?? ""}" to ${player}.`,
        );
      }
      if (!catalog.aspects.includes(choice.aspect)) {
        errors.push(
          `${villain} assigns unknown aspect "${choice.aspect ?? ""}" to ${player}.`,
        );
      }
    }
  });

  for (const villain of catalog.villains) {
    if (!assignmentsByVillain.has(villain)) {
      errors.push(`The schedule is missing the ${villain} scenario.`);
    }
  }

  const playerHeroes = new Map();
  const heroAspects = new Map();
  for (const [villain, assignment] of assignmentsByVillain) {
    const scenarioHeroes = new Map();
    const scenarioAspects = new Map();
    for (const player of catalog.players) {
      const choice = choiceAt(assignment, player);
      if (
        !choice ||
        !catalog.heroes.includes(choice.hero) ||
        !catalog.aspects.includes(choice.aspect)
      ) {
        continue;
      }

      const playerHeroKey = `${player}\0${choice.hero}`;
      if (playerHeroes.has(playerHeroKey)) {
        errors.push(
          `${player} uses ${choice.hero} against both ${playerHeroes.get(playerHeroKey)} and ${villain}.`,
        );
      } else {
        playerHeroes.set(playerHeroKey, villain);
      }

      const heroAspectKey = `${choice.hero}\0${choice.aspect}`;
      if (heroAspects.has(heroAspectKey)) {
        errors.push(
          `${choice.hero} — ${choice.aspect} is used by ${heroAspects.get(heroAspectKey)} and ${player} against ${villain}.`,
        );
      } else {
        heroAspects.set(heroAspectKey, `${player} against ${villain}`);
      }

      if (scenarioHeroes.has(choice.hero)) {
        errors.push(
          `${villain} assigns ${choice.hero} to both ${scenarioHeroes.get(choice.hero)} and ${player}.`,
        );
      } else {
        scenarioHeroes.set(choice.hero, player);
      }
      if (scenarioAspects.has(choice.aspect)) {
        errors.push(
          `${villain} assigns ${choice.aspect} to both ${scenarioAspects.get(choice.aspect)} and ${player}.`,
        );
      } else {
        scenarioAspects.set(choice.aspect, player);
      }
    }
  }

  for (const lock of locks) {
    const choice = choiceAt(
      assignmentsByVillain.get(lock.villain),
      lock.player,
    );
    if (!choice || choice.hero !== lock.hero || choice.aspect !== lock.aspect) {
      errors.push(
        `Locked assignment for ${lockLabel(lock)} must remain ${lock.hero} — ${lock.aspect}.`,
      );
    }
  }

  return errors;
}

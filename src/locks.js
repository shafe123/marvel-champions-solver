function hasName(names, name) {
  return names.includes(name);
}

function describeLock(index) {
  return `Lock ${index + 1}`;
}

export function validateLocks(catalog, locks = []) {
  const errors = [];
  const slots = new Map();
  const playerHeroes = new Map();
  const heroAspects = new Map();
  const scenarioHeroes = new Map();
  const scenarioAspects = new Map();

  locks.forEach((lock, index) => {
    const label = describeLock(index);
    for (const [field, names, labelName] of [
      ["villain", catalog.villains, "villain scenario"],
      ["player", catalog.players, "player"],
      ["hero", catalog.heroes, "hero"],
      ["aspect", catalog.aspects, "aspect"],
    ]) {
      if (!lock[field]) {
        errors.push(`${label}: choose a ${labelName}.`);
      } else if (!hasName(names, lock[field])) {
        errors.push(`${label}: unknown ${labelName} "${lock[field]}".`);
      }
    }

    if (![lock.villain, lock.player, lock.hero, lock.aspect].every(Boolean)) {
      return;
    }

    const slotKey = `${lock.villain}\0${lock.player}`;
    if (slots.has(slotKey)) {
      errors.push(
        `${label}: duplicate slot for ${lock.player} against ${lock.villain} (also locked in ${describeLock(slots.get(slotKey))}).`,
      );
    } else {
      slots.set(slotKey, index);
    }

    const playerHeroKey = `${lock.player}\0${lock.hero}`;
    if (
      playerHeroes.has(playerHeroKey) &&
      playerHeroes.get(playerHeroKey).villain !== lock.villain
    ) {
      errors.push(
        `${label}: ${lock.player} cannot reuse ${lock.hero}; it is already locked against ${playerHeroes.get(playerHeroKey).villain}.`,
      );
    } else {
      playerHeroes.set(playerHeroKey, lock);
    }

    const heroAspectKey = `${lock.hero}\0${lock.aspect}`;
    if (heroAspects.has(heroAspectKey)) {
      const previous = heroAspects.get(heroAspectKey);
      errors.push(
        `${label}: ${lock.hero} — ${lock.aspect} is already locked for ${previous.player} against ${previous.villain}.`,
      );
    } else {
      heroAspects.set(heroAspectKey, lock);
    }

    const scenarioHeroKey = `${lock.villain}\0${lock.hero}`;
    if (
      scenarioHeroes.has(scenarioHeroKey) &&
      scenarioHeroes.get(scenarioHeroKey).player !== lock.player
    ) {
      errors.push(
        `${label}: ${lock.hero} is already locked for ${scenarioHeroes.get(scenarioHeroKey).player} against ${lock.villain}; heroes must differ within a scenario.`,
      );
    } else {
      scenarioHeroes.set(scenarioHeroKey, lock);
    }

    const scenarioAspectKey = `${lock.villain}\0${lock.aspect}`;
    if (
      scenarioAspects.has(scenarioAspectKey) &&
      scenarioAspects.get(scenarioAspectKey).player !== lock.player
    ) {
      errors.push(
        `${label}: ${lock.aspect} is already locked for ${scenarioAspects.get(scenarioAspectKey).player} against ${lock.villain}; aspects must differ within a scenario.`,
      );
    } else {
      scenarioAspects.set(scenarioAspectKey, lock);
    }
  });

  return errors;
}

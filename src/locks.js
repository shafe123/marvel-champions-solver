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
  const playerAspects = new Map();
  const playerLockedSlots = new Map();
  const minAspectUses = Math.floor(
    catalog.villains.length / catalog.aspects.length,
  );
  const maxAspectUses = Math.ceil(
    catalog.villains.length / catalog.aspects.length,
  );

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

    if (
      catalog.players.includes(lock.player) &&
      catalog.aspects.includes(lock.aspect)
    ) {
      playerLockedSlots.set(
        lock.player,
        (playerLockedSlots.get(lock.player) ?? 0) + 1,
      );
      const playerAspectKey = `${lock.player}\0${lock.aspect}`;
      const count = (playerAspects.get(playerAspectKey) ?? 0) + 1;
      playerAspects.set(playerAspectKey, count);
      if (count > maxAspectUses) {
        errors.push(
          `${label}: ${lock.player} cannot use ${lock.aspect} more than ${maxAspectUses} times; aspects must be balanced across the schedule.`,
        );
      }
    }
  });

  for (const player of catalog.players) {
    const missingAspectUses = catalog.aspects.reduce(
      (total, aspect) =>
        total +
        Math.max(
          0,
          minAspectUses - (playerAspects.get(`${player}\0${aspect}`) ?? 0),
        ),
      0,
    );
    const unlockedSlots =
      catalog.villains.length - (playerLockedSlots.get(player) ?? 0);
    if (missingAspectUses > unlockedSlots) {
      errors.push(
        `${player}'s locks leave too few scenarios to balance every aspect across the schedule.`,
      );
    }
  }

  return errors;
}

import { validateSchedule } from "../src/schedule-validation.js";

const catalog = {
  players: ["Player 1", "Player 2"],
  heroes: ["Hero A", "Hero B", "Hero C", "Hero D"],
  aspects: ["Aspect A", "Aspect B", "Aspect C", "Aspect D"],
  villains: ["Villain A", "Villain B"],
};

const validSchedule = [
  {
    villain: "Villain A",
    players: {
      "Player 1": { hero: "Hero A", aspect: "Aspect A" },
      "Player 2": { hero: "Hero B", aspect: "Aspect B" },
    },
  },
  {
    villain: "Villain B",
    players: {
      "Player 1": { hero: "Hero C", aspect: "Aspect C" },
      "Player 2": { hero: "Hero D", aspect: "Aspect D" },
    },
  },
];

function copy(schedule = validSchedule) {
  return JSON.parse(JSON.stringify(schedule));
}

function expectError(description, schedule, expected, locks = []) {
  const errors = validateSchedule(catalog, schedule, locks);
  if (!errors.some((error) => error.includes(expected))) {
    throw new Error(
      `${description}: expected "${expected}", received ${JSON.stringify(errors)}`,
    );
  }
}

if (validateSchedule(catalog, validSchedule).length !== 0) {
  throw new Error("A complete valid schedule should pass validation.");
}

expectError("incomplete schedule", validSchedule.slice(0, 1), "must contain");
expectError(
  "unknown scenario",
  [{ ...copy()[0], villain: "Unknown villain" }, copy()[1]],
  'unknown villain "Unknown villain"',
);
expectError(
  "missing player",
  [{ villain: "Villain A", players: {} }, copy()[1]],
  "missing an assignment for Player 1",
);
expectError(
  "unknown hero",
  [
    {
      ...copy()[0],
      players: {
        ...copy()[0].players,
        "Player 1": { hero: "Unknown hero", aspect: "Aspect A" },
      },
    },
    copy()[1],
  ],
  'unknown hero "Unknown hero"',
);
expectError(
  "unknown aspect",
  [
    {
      ...copy()[0],
      players: {
        ...copy()[0].players,
        "Player 1": { hero: "Hero A", aspect: "Unknown aspect" },
      },
    },
    copy()[1],
  ],
  'unknown aspect "Unknown aspect"',
);
expectError(
  "unknown player",
  [
    {
      ...copy()[0],
      players: {
        ...copy()[0].players,
        "Unknown player": { hero: "Hero C", aspect: "Aspect C" },
      },
    },
    copy()[1],
  ],
  'unknown player "Unknown player"',
);
expectError(
  "duplicate scenario",
  [copy()[0], { ...copy()[1], villain: "Villain A" }],
  "contains Villain A more than once",
);
expectError(
  "unique hero per player",
  [
    copy()[0],
    {
      ...copy()[1],
      players: {
        ...copy()[1].players,
        "Player 1": { hero: "Hero A", aspect: "Aspect C" },
      },
    },
  ],
  "Player 1 uses Hero A",
);
expectError(
  "global hero-aspect uniqueness",
  [
    copy()[0],
    {
      ...copy()[1],
      players: {
        ...copy()[1].players,
        "Player 1": { hero: "Hero A", aspect: "Aspect A" },
      },
    },
  ],
  "Hero A — Aspect A is used",
);
expectError(
  "unique hero within scenario",
  [
    {
      ...copy()[0],
      players: {
        ...copy()[0].players,
        "Player 2": { hero: "Hero A", aspect: "Aspect B" },
      },
    },
    copy()[1],
  ],
  "Villain A assigns Hero A",
);
expectError(
  "unique aspect within scenario",
  [
    {
      ...copy()[0],
      players: {
        ...copy()[0].players,
        "Player 2": { hero: "Hero B", aspect: "Aspect A" },
      },
    },
    copy()[1],
  ],
  "Villain A assigns Aspect A",
);
expectError(
  "locked assignment preservation",
  [
    {
      ...copy()[0],
      players: {
        ...copy()[0].players,
        "Player 1": { hero: "Hero B", aspect: "Aspect A" },
      },
    },
    copy()[1],
  ],
  "Locked assignment for Player 1 against Villain A",
  [
    {
      villain: "Villain A",
      player: "Player 1",
      hero: "Hero A",
      aspect: "Aspect A",
    },
  ],
);

console.log("Schedule validation rules passed.");

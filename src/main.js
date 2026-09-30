import defaultCatalog from "../catalog.json";
import { parseNames } from "./catalog-input.js";
import { validateLocks } from "./locks.js";
import "./style.css";

const fields = {
  players: document.querySelector("#players"),
  heroes: document.querySelector("#heroes"),
  aspects: document.querySelector("#aspects"),
  villains: document.querySelector("#villains"),
};
const form = document.querySelector("#catalog-form");
const generateButton = document.querySelector("#generate");
const randomizeButton = document.querySelector("#randomize");
const resetButton = document.querySelector("#reset");
const addLockButton = document.querySelector("#add-lock");
const lockRows = document.querySelector("#lock-rows");
const messages = document.querySelector("#messages");
const results = document.querySelector("#results");

let solverWorker;

function createSelect(field, names, value) {
  const select = document.createElement("select");
  select.name = field;
  select.setAttribute("aria-label", `Locked assignment ${field}`);
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `Choose ${field}`;
  select.append(placeholder);
  if (value && !names.includes(value)) {
    const unknown = document.createElement("option");
    unknown.value = value;
    unknown.textContent = `${value} (not in current catalog)`;
    select.append(unknown);
  }
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  select.value = value ?? "";
  return select;
}

function getLocks() {
  return [...lockRows.querySelectorAll(".lock-row")].map((row) =>
    Object.fromEntries(
      ["villain", "player", "hero", "aspect"].map((field) => [
        field,
        row.querySelector(`[name="${field}"]`).value,
      ]),
    ),
  );
}

function addLock(lock = {}) {
  const catalog = getCatalog();
  const row = document.createElement("div");
  row.className = "lock-row";
  for (const field of ["villain", "player", "hero", "aspect"]) {
    row.append(
      createSelect(
        field,
        catalog[field === "hero" ? "heroes" : `${field}s`],
        lock[field],
      ),
    );
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-lock";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());
  row.append(remove);
  lockRows.append(row);
}

function refreshLockOptions() {
  const locks = getLocks();
  lockRows.replaceChildren();
  locks.forEach(addLock);
}

function formatNames(names) {
  return names.join("\n");
}

function restoreCatalog() {
  for (const [field, element] of Object.entries(fields)) {
    element.value = formatNames(defaultCatalog[field]);
  }
  clearResults();
  showMessages([]);
  lockRows.replaceChildren();
}

function findDuplicates(names) {
  const seen = new Set();
  return [
    ...new Set(
      names.filter((name) => (seen.has(name) ? true : !seen.add(name))),
    ),
  ];
}

function getCatalog() {
  return Object.fromEntries(
    Object.entries(fields).map(([field, element]) => [
      field,
      parseNames(element.value),
    ]),
  );
}

function validateCatalog(catalog) {
  const errors = [];
  const warnings = [];

  for (const [field, names] of Object.entries(catalog)) {
    if (names.length === 0) {
      errors.push(`Add at least one ${field.slice(0, -1)}.`);
    }
    const duplicates = findDuplicates(names);
    if (duplicates.length > 0) {
      errors.push(`Duplicate ${field}: ${duplicates.join(", ")}.`);
    }
  }

  if (errors.length > 0) {
    return { errors, warnings };
  }

  const assignments = catalog.players.length * catalog.villains.length;
  const heroAspectCapacity = catalog.heroes.length * catalog.aspects.length;
  if (catalog.villains.length > catalog.heroes.length) {
    errors.push(
      `${catalog.villains.length} scenarios require each player to use ${catalog.villains.length} distinct heroes, but only ${catalog.heroes.length} heroes are available.`,
    );
  }
  if (catalog.players.length > catalog.heroes.length) {
    errors.push(
      `${catalog.players.length} players cannot use distinct heroes in one scenario when only ${catalog.heroes.length} heroes are available.`,
    );
  }
  if (assignments > heroAspectCapacity) {
    errors.push(
      `${assignments} assignments exceed the ${heroAspectCapacity} unique hero–aspect pairings available.`,
    );
  }
  if (catalog.villains.length === catalog.heroes.length) {
    warnings.push("Every player will use every hero exactly once.");
  } else if (catalog.villains.length > catalog.heroes.length - 3) {
    warnings.push(
      "Very few unused heroes remain per player; solving may take longer.",
    );
  }
  return { errors, warnings };
}

function showMessages(items) {
  messages.replaceChildren(
    ...items.map(({ type, text }) => {
      const message = document.createElement("p");
      message.className = `message ${type}`;
      message.textContent = text;
      return message;
    }),
  );
}

function clearResults() {
  results.hidden = true;
  results.replaceChildren();
}

function renderResults(assignments, locks) {
  const lockedSlots = new Set(
    locks.map(({ villain, player }) => `${villain}\0${player}`),
  );
  const table = document.createElement("table");
  const header = document.createElement("tr");
  header.innerHTML = '<th scope="col">Villain</th>';
  for (const player of assignments[0].players
    ? Object.keys(assignments[0].players)
    : []) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = player;
    header.append(cell);
  }
  const thead = document.createElement("thead");
  thead.append(header);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const assignment of assignments) {
    const row = document.createElement("tr");
    const villain = document.createElement("th");
    villain.scope = "row";
    villain.textContent = assignment.villain;
    row.append(villain);
    for (const [player, choice] of Object.entries(assignment.players)) {
      const cell = document.createElement("td");
      cell.textContent = `${choice.hero} — ${choice.aspect}`;
      if (lockedSlots.has(`${assignment.villain}\0${player}`)) {
        const badge = document.createElement("span");
        badge.className = "lock-badge";
        badge.textContent = "Locked";
        cell.append(document.createElement("br"), badge);
      }
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(tbody);

  const heading = document.createElement("h2");
  heading.textContent = `Solution (${assignments.length} scenarios)`;
  results.replaceChildren(heading, table);
  results.hidden = false;
}

function getWorker() {
  if (!solverWorker) {
    solverWorker = new Worker(new URL("./solver-worker.js", import.meta.url), {
      type: "module",
    });
  }
  return solverWorker;
}

function solve(catalog, locks, randomize = false) {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const handleMessage = ({ data }) => {
      worker.removeEventListener("message", handleMessage);
      if (data.type === "error") {
        reject(new Error(data.message));
      } else {
        resolve(data.assignments);
      }
    };
    worker.addEventListener("message", handleMessage);
    worker.postMessage({ type: "solve", catalog, locks, randomize });
  });
}

async function generateSolution(randomize) {
  clearResults();
  const catalog = getCatalog();
  const locks = getLocks();
  const { errors: catalogErrors, warnings } = validateCatalog(catalog);
  const errors = [...catalogErrors, ...validateLocks(catalog, locks)];
  if (errors.length > 0) {
    showMessages(errors.map((text) => ({ type: "error", text })));
    return;
  }

  generateButton.disabled = true;
  randomizeButton.disabled = true;
  const activeButton = randomize ? randomizeButton : generateButton;
  activeButton.textContent = "Solving…";
  showMessages([
    ...warnings.map((text) => ({ type: "warning", text })),
    {
      type: "info",
      text: randomize
        ? "Building a randomized optimization model in your browser…"
        : "Building and solving the optimization model in your browser…",
    },
  ]);

  try {
    const assignments = await solve(catalog, locks, randomize);
    showMessages([
      ...warnings.map((text) => ({ type: "warning", text })),
      {
        type: "success",
        text: randomize
          ? "Valid randomized solution generated."
          : "Valid solution generated.",
      },
    ]);
    renderResults(assignments, locks);
  } catch (error) {
    showMessages([
      ...warnings.map((text) => ({ type: "warning", text })),
      { type: "error", text: error.message },
    ]);
  } finally {
    generateButton.disabled = false;
    randomizeButton.disabled = false;
    generateButton.textContent = "Generate solution";
    randomizeButton.textContent = "Randomize solution";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generateSolution(false);
});

randomizeButton.addEventListener("click", () => generateSolution(true));
resetButton.addEventListener("click", restoreCatalog);
addLockButton.addEventListener("click", () => addLock());
Object.values(fields).forEach((field) =>
  field.addEventListener("input", refreshLockOptions),
);
restoreCatalog();

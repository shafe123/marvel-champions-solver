import defaultCatalog from "../catalog.json";
import { parseNames } from "./catalog-input.js";
import "./style.css";

const fields = {
  players: document.querySelector("#players"),
  heroes: document.querySelector("#heroes"),
  aspects: document.querySelector("#aspects"),
  villains: document.querySelector("#villains"),
};
const form = document.querySelector("#catalog-form");
const generateButton = document.querySelector("#generate");
const resetButton = document.querySelector("#reset");
const messages = document.querySelector("#messages");
const results = document.querySelector("#results");

let solverWorker;

function formatNames(names) {
  return names.join("\n");
}

function restoreCatalog() {
  for (const [field, element] of Object.entries(fields)) {
    element.value = formatNames(defaultCatalog[field]);
  }
  clearResults();
  showMessages([]);
}

function findDuplicates(names) {
  const seen = new Set();
  return [...new Set(names.filter((name) => (seen.has(name) ? true : !seen.add(name))))];
}

function getCatalog() {
  return Object.fromEntries(
    Object.entries(fields).map(([field, element]) => [field, parseNames(element.value)]),
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
    warnings.push("Very few unused heroes remain per player; solving may take longer.");
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

function renderResults(assignments) {
  const table = document.createElement("table");
  const header = document.createElement("tr");
  header.innerHTML = "<th scope=\"col\">Villain</th>";
  for (const player of assignments[0].players ? Object.keys(assignments[0].players) : []) {
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
    for (const choice of Object.values(assignment.players)) {
      const cell = document.createElement("td");
      cell.textContent = `${choice.hero} — ${choice.aspect}`;
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

function solve(catalog) {
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
    worker.postMessage({ type: "solve", catalog });
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearResults();
  const catalog = getCatalog();
  const { errors, warnings } = validateCatalog(catalog);
  if (errors.length > 0) {
    showMessages(errors.map((text) => ({ type: "error", text })));
    return;
  }

  generateButton.disabled = true;
  generateButton.textContent = "Solving…";
  showMessages([
    ...warnings.map((text) => ({ type: "warning", text })),
    { type: "info", text: "Building and solving the optimization model in your browser…" },
  ]);

  try {
    const assignments = await solve(catalog);
    showMessages([
      ...warnings.map((text) => ({ type: "warning", text })),
      { type: "success", text: "Valid solution generated." },
    ]);
    renderResults(assignments);
  } catch (error) {
    showMessages([
      ...warnings.map((text) => ({ type: "warning", text })),
      { type: "error", text: error.message },
    ]);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Generate solution";
  }
});

resetButton.addEventListener("click", restoreCatalog);
restoreCatalog();

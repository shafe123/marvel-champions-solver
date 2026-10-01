# Marvel Champions assignment solver

This project includes a Python command-line solver and a static web application. Both assign every player a hero and aspect for every villain scenario and enforce these rules:

- A player uses each hero at most once.
- Each hero-aspect pairing is used at most once across every player and scenario.
- Players facing the same scenario use different heroes.
- Players facing the same scenario use different aspects.

The default [`catalog.json`](catalog.json) contains the approved 69 heroes, 5 aspects, 4 players, and 65 villain scenarios.

## Web application

The GitHub Pages application runs the solver privately in the browser using [GLPK.js](https://github.com/jvail/glpk.js), a WebAssembly mixed-integer solver. It provides editable lists for players, heroes, aspects, and villain scenarios, explains infeasible inputs, and displays the generated assignment. **Generate solution** uses a deterministic model order. **Randomize solution** shuffles only the solver's internal model order before solving, while retaining the entered player and villain order in the displayed schedule. It produces varied feasible schedules, but does not uniformly sample all valid schedules.

### Locking assignments

Use **Add locked assignment** to add a row to the manual-assignment table, then choose a villain, player, hero, and aspect. Each valid lock becomes a fixed assignment in the browser optimization model while the solver fills the remaining slots. The table has labeled columns and accessible controls, and rows can be removed with **Remove**. Locks are marked in the solution table. Before solving, the app identifies unknown names, incomplete locks, duplicate player/scenario slots, a player reusing a hero, globally reused hero–aspect pairs, and duplicate heroes or aspects within a scenario.

The approved aspects have high-contrast color labels in manual assignment controls and solution results: Aggression (red), Justice (yellow), Protection (green), Leadership (blue), and 'Pool (pink). Aspect names are always shown alongside their colors.

### Swapping generated assignments

After generating a solution, drag a complete hero-and-aspect assignment onto another assignment to swap them. Keyboard and touch users can instead select one assignment, then select a second assignment as the swap target. The app validates the proposed schedule before changing the displayed solution; an invalid swap explains the violated rule and leaves the schedule unchanged. Locked assignments have a **Locked** badge and cannot be dragged, selected, or swapped.

```bash
npm ci
npm run build
cd dist && python -m http.server 8000
```

Open `http://localhost:8000`. Run `npm run test:web` to validate the full browser solver model, schedule-validation rules, and critical interactive styling against the default catalog.

The deployment workflow publishes `dist/` to GitHub Pages whenever `main` changes.

## Pull request review gate

Pull requests must pass validation and the review gate before auto-merge. The gate waits for the current-head Copilot review to complete successfully, then polls every paginated review thread until each is resolved or the gate times out.

## Quality checks

The pull-request validation workflow enforces formatting, linting, browser tests, a static build, and Python tests. Run the same checks locally with:

```bash
npm ci
npm run format:check
npm run lint
npm run test:web
npm run build

python -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/ruff format --check .
.venv/bin/ruff check .
.venv/bin/python -m unittest -v
```

Use `npm run format` and `.venv/bin/ruff format .` to apply the configured formatters.

## Run

```bash
python -m pip install -r requirements.txt
python marvel_solver.py --catalog catalog.json --output assignments.json
```

The output is JSON, grouped by villain scenario and then player:

```json
{
  "villain": "Rhino",
  "players": {
    "Player 1": { "hero": "Spider-Man (Peter Parker)", "aspect": "Justice" }
  }
}
```

The solver produces a deterministic feasible assignment. `--seed` is retained for future
search-strategy tuning, and `--time-limit` changes the CP-SAT search limit.

## Feasibility checks

Before invoking CP-SAT, the solver gives a clear error when the catalog cannot meet the constraints. In particular:

- Villains cannot outnumber heroes, because every player needs a different hero for every scenario.
- The total assignments cannot exceed `heroes × aspects`.
- Players cannot outnumber heroes, since a scenario cannot contain duplicate heroes.
- Players cannot outnumber aspects, since a scenario cannot contain duplicate aspects.

Run the test suite with:

```bash
python -m unittest -v
```

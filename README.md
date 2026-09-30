# Marvel Champions assignment solver

This project includes a Python command-line solver and a static web application. Both assign every player a hero and aspect for every villain scenario and enforce these rules:

- A player uses each hero at most once.
- Each hero-aspect pairing is used at most once across every player and scenario.
- Players facing the same scenario use different heroes.

The default [`catalog.json`](catalog.json) contains the approved 69 heroes, 5 aspects, 4 players, and 65 villain scenarios.

## Web application

The GitHub Pages application runs the solver privately in the browser using [GLPK.js](https://github.com/jvail/glpk.js), a WebAssembly mixed-integer solver. It provides editable lists for players, heroes, aspects, and villain scenarios, explains infeasible inputs, and displays the generated assignment. **Generate solution** uses a deterministic model order. **Randomize solution** shuffles only the solver's internal model order before solving, while retaining the entered player and villain order in the displayed schedule. It produces varied feasible schedules, but does not uniformly sample all valid schedules.

### Locking assignments

Use **Add locked assignment** to choose a villain, player, hero, and aspect. Each valid lock becomes a fixed assignment in the browser optimization model while the solver fills the remaining slots. Locks are marked in the solution table. Before solving, the app identifies unknown names, incomplete locks, duplicate player/scenario slots, a player reusing a hero, globally reused hero–aspect pairs, and duplicate heroes within a scenario.

```bash
npm ci
npm run build
cd dist && python -m http.server 8000
```

Open `http://localhost:8000`. Run `npm run test:web` to validate the full browser solver model against the default catalog.

The deployment workflow publishes `dist/` to GitHub Pages whenever `main` changes.

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
    "Player 1": {"hero": "Spider-Man (Peter Parker)", "aspect": "Justice"}
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

Run the test suite with:

```bash
python -m unittest -v
```

#!/usr/bin/env python3
"""Assign a hero and aspect to every player for every Marvel Champions scenario."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ortools.sat.python import cp_model


@dataclass(frozen=True)
class Catalog:
    players: tuple[str, ...]
    heroes: tuple[str, ...]
    aspects: tuple[str, ...]
    villains: tuple[str, ...]


def _read_names(data: dict[str, Any], field: str) -> tuple[str, ...]:
    values = data.get(field)
    if not isinstance(values, list) or not values:
        raise ValueError(f"'{field}' must be a non-empty JSON array of names.")
    if any(not isinstance(value, str) or not value.strip() for value in values):
        raise ValueError(f"'{field}' must contain only non-empty strings.")
    normalized = tuple(value.strip() for value in values)
    duplicates = sorted({value for value in normalized if normalized.count(value) > 1})
    if duplicates:
        raise ValueError(
            f"'{field}' contains duplicate names: {', '.join(duplicates)}."
        )
    return normalized


def load_catalog(path: Path) -> Catalog:
    """Load and validate a user-editable catalog JSON file."""
    try:
        contents = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Catalog file does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Catalog is not valid JSON: {error}") from error

    if not isinstance(contents, dict):
        raise ValueError("Catalog root must be a JSON object.")

    return Catalog(
        players=_read_names(contents, "players"),
        heroes=_read_names(contents, "heroes"),
        aspects=_read_names(contents, "aspects"),
        villains=_read_names(contents, "villains"),
    )


def validate_feasibility(catalog: Catalog) -> None:
    """Reject catalog sizes that cannot satisfy the solver's hard constraints."""
    games_per_player = len(catalog.villains)
    player_assignments = games_per_player * len(catalog.players)
    hero_aspect_capacity = len(catalog.heroes) * len(catalog.aspects)

    if games_per_player > len(catalog.heroes):
        raise ValueError(
            f"{games_per_player} villains require each player to use "
            f"{games_per_player} "
            f"distinct heroes, but only {len(catalog.heroes)} heroes are available."
        )
    if len(catalog.players) > len(catalog.heroes):
        raise ValueError(
            f"{len(catalog.players)} players cannot use distinct heroes in one game "
            f"when only {len(catalog.heroes)} heroes are available."
        )
    if player_assignments > hero_aspect_capacity:
        raise ValueError(
            f"{player_assignments} assignments exceed the {hero_aspect_capacity} "
            "unique hero-aspect combinations available."
        )


def solve(
    catalog: Catalog, time_limit_seconds: float, random_seed: int
) -> list[dict[str, Any]]:
    """Return one assignment for every villain and player."""
    validate_feasibility(catalog)

    model = cp_model.CpModel()
    choices: dict[tuple[int, int, int, int], cp_model.IntVar] = {}
    for villain_index in range(len(catalog.villains)):
        for player_index in range(len(catalog.players)):
            for hero_index in range(len(catalog.heroes)):
                for aspect_index in range(len(catalog.aspects)):
                    choices[villain_index, player_index, hero_index, aspect_index] = (
                        model.new_bool_var(
                            f"choice_v{villain_index}_p{player_index}_h{hero_index}_a{aspect_index}"
                        )
                    )

    # Every player receives one hero-and-aspect pairing for every scenario.
    for villain_index in range(len(catalog.villains)):
        for player_index in range(len(catalog.players)):
            model.add_exactly_one(
                choices[villain_index, player_index, hero_index, aspect_index]
                for hero_index in range(len(catalog.heroes))
                for aspect_index in range(len(catalog.aspects))
            )

    # A player cannot replay a hero in another scenario.
    for player_index in range(len(catalog.players)):
        for hero_index in range(len(catalog.heroes)):
            model.add_at_most_one(
                choices[villain_index, player_index, hero_index, aspect_index]
                for villain_index in range(len(catalog.villains))
                for aspect_index in range(len(catalog.aspects))
            )

    # A hero can use an aspect only once across all players and scenarios.
    for hero_index in range(len(catalog.heroes)):
        for aspect_index in range(len(catalog.aspects)):
            model.add_at_most_one(
                choices[villain_index, player_index, hero_index, aspect_index]
                for villain_index in range(len(catalog.villains))
                for player_index in range(len(catalog.players))
            )

    # Players in the same game must have different identities.
    for villain_index in range(len(catalog.villains)):
        for hero_index in range(len(catalog.heroes)):
            model.add_at_most_one(
                choices[villain_index, player_index, hero_index, aspect_index]
                for player_index in range(len(catalog.players))
                for aspect_index in range(len(catalog.aspects))
            )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.random_seed = random_seed
    solver.parameters.num_search_workers = 1
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(
            f"No valid assignment exists (CP-SAT status: {solver.status_name(status)})."
        )

    assignments: list[dict[str, Any]] = []
    for villain_index, villain in enumerate(catalog.villains):
        players: dict[str, dict[str, str]] = {}
        for player_index, player in enumerate(catalog.players):
            for hero_index, hero in enumerate(catalog.heroes):
                for aspect_index, aspect in enumerate(catalog.aspects):
                    if solver.value(
                        choices[villain_index, player_index, hero_index, aspect_index]
                    ):
                        players[player] = {"hero": hero, "aspect": aspect}
        assignments.append({"villain": villain, "players": players})
    return assignments


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=Path("catalog.json"))
    parser.add_argument("--output", type=Path, default=Path("assignments.json"))
    parser.add_argument("--time-limit", type=float, default=60.0)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    if args.time_limit <= 0:
        parser.error("--time-limit must be greater than zero.")

    catalog = load_catalog(args.catalog)
    assignments = solve(catalog, args.time_limit, args.seed)
    output = {
        "catalog": {
            "players": list(catalog.players),
            "heroes": list(catalog.heroes),
            "aspects": list(catalog.aspects),
            "villains": list(catalog.villains),
        },
        "assignments": assignments,
    }
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(assignments)} scenario assignments to {args.output}.")


if __name__ == "__main__":
    main()

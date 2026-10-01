import unittest

from marvel_solver import Catalog, solve, validate_feasibility


class SolverTests(unittest.TestCase):
    def test_assignments_honor_all_constraints(self) -> None:
        catalog = Catalog(
            players=("A", "B"),
            heroes=("Hero 1", "Hero 2", "Hero 3", "Hero 4"),
            aspects=("Aggression", "Justice"),
            villains=("Villain 1", "Villain 2", "Villain 3"),
        )

        assignments = solve(catalog, time_limit_seconds=5, random_seed=1)

        player_heroes = {player: set() for player in catalog.players}
        player_aspects = {
            player: {aspect: 0 for aspect in catalog.aspects}
            for player in catalog.players
        }
        hero_aspects = set()
        for scenario in assignments:
            scenario_heroes = set()
            scenario_aspects = set()
            for player, choice in scenario["players"].items():
                self.assertNotIn(choice["hero"], player_heroes[player])
                self.assertNotIn((choice["hero"], choice["aspect"]), hero_aspects)
                self.assertNotIn(choice["hero"], scenario_heroes)
                self.assertNotIn(choice["aspect"], scenario_aspects)
                player_heroes[player].add(choice["hero"])
                hero_aspects.add((choice["hero"], choice["aspect"]))
                scenario_heroes.add(choice["hero"])
                scenario_aspects.add(choice["aspect"])
                player_aspects[player][choice["aspect"]] += 1

        for aspect_counts in player_aspects.values():
            self.assertLessEqual(
                max(aspect_counts.values()) - min(aspect_counts.values()), 1
            )

    def test_feasibility_rejects_too_many_scenarios(self) -> None:
        catalog = Catalog(
            players=("A",),
            heroes=("Hero 1",),
            aspects=("Justice",),
            villains=("Villain 1", "Villain 2"),
        )

        with self.assertRaisesRegex(ValueError, "distinct heroes"):
            validate_feasibility(catalog)

    def test_feasibility_rejects_too_many_players_for_aspects(self) -> None:
        catalog = Catalog(
            players=("A", "B"),
            heroes=("Hero 1", "Hero 2"),
            aspects=("Justice",),
            villains=("Villain 1",),
        )

        with self.assertRaisesRegex(ValueError, "distinct aspects"):
            validate_feasibility(catalog)


if __name__ == "__main__":
    unittest.main()

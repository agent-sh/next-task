# Repo-intel context for /next-task

Optional enrichment. `/next-task` passes these signals to its agents when the repo has a cached map, so the agents do not re-derive them from file reads. Everything here degrades to "no context": a missing map, binary, or query result never blocks a phase.

## Running a query

The map is `<stateDir>/repo-intel.json` (`stateDir` from `lib/platform/state-dir.js`: `.claude`, `.opencode` or `.codex`). Queries go through `runAnalyzer(args)` in `${CLAUDE_PLUGIN_ROOT}/lib/binary`, which downloads `agent-analyzer` on first use and returns JSON text:

```
repo-intel query <name> [--top N] [--files a,b] --map-file <map> <cwd>
```

Results are either an array or an object wrapping one (`fixes`, `entryPoints`, `targets`). Unwrap both shapes. If a query throws, log `[WARN] repo-intel query failed (<name>)` and continue without it.

## Exploration and planning context (Phases 4 and 5)

| Query | Args | Use |
|---|---|---|
| `hotspots` | `--top 15` | Files that change most. Overlap with the task means in-flight conflict risk. |
| `bugspots` | `--top 10` | Highest bug-fix density. Overlap means fragile: more tests, smaller change. |
| `bus-factor` | | Knowledge concentration and owners. |
| `conventions` | | Commit and code style to match. |
| `entry-points` | | Binaries, `main()`, framework configs. Changing one is user-visible and needs release notes. Pass at most 30. |
| `slop-fixes` | | Split by `category` into `orphan-export`, `passthrough-wrapper`, `always-true-condition`, `commented-out-code`. Keep counts per category and up to 10 samples each. |
| `slop-targets` | `--top 20` | Cross-file clusters: wrapper towers, single-impl traits, cliche names. Pass at most 15. |

Pass the same block to the planning agent, so both see the same signals.

## Pre-review context (Phase 8)

`test-gaps --top 20`: hot files with no co-changing test. Pass to the test-coverage checker.

## Review context (Phase 9)

Compute the changed files with `git diff --name-only <base>...HEAD`, normalize separators to `/`, then:

| Query | Args | Filter | Cap |
|---|---|---|---|
| `diff-risk` | `--files <changed, comma-separated>` | none | all |
| `slop-fixes` | | `action.path` in the changed set, sorted by `confidence` descending | 30 |
| `entry-points` | | `path` in the changed set | 30 |
| `slop-targets` | `--top 200` (the query has no file filter) | `path` or `file` in the changed set | 15 |

Tell reviewers what each block means: diff-risk orders attention, slop findings are pre-computed and need no re-scan, entry points are execution surfaces (do not flag them as missing library docs), slop targets are cross-file patterns no per-file pass would catch.

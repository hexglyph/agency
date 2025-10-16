# Repository Guidelines

Use these rules to keep future agent features consistent and reviewable.

## Project Structure & Module Organization
- `src/` - Core runtime packages (`core`, `tools`, `runners`); include `__init__.py`.
- `agents/` - Agent presets and configs (`agents/<name>/config.yaml`, `prompt.md`).
- `tests/` - Pytest suites mirroring `src/` paths; separate `unit` and `integration`.
- `data/` - Sample fixtures only; never commit secrets or customer data.
- `scripts/` - Automation helpers (`scripts/bootstrap.py`, `scripts/sync_configs.py`) with usage comments at the top.

## Build, Test, and Development Commands
Use Make targets instead of raw commands:
```bash
make install         # Sync deps from requirements.lock
make lint            # Ruff + mypy on src/ and agents/
make test            # Pytest with coverage html
make run AGENT=demo  # Run the selected agent locally
```
Keep CI scripts in sync whenever a target changes.

## Coding Style & Naming Conventions
Primary language is Python 3.11+. Format via `ruff format`, lint with `ruff check`, and type-check with `mypy`. Use 4 spaces, snake_case modules/functions, PascalCase classes, and SCREAMING_SNAKE_CASE constants. Keep YAML keys hyphenated and document env vars in `.env.example`. Break helpers past ~50 lines into shared modules.

## Testing Guidelines
Co-locate tests with matching module paths (`tests/tools/test_vector_store.py`). Maintain >=80% coverage; justify gaps in the PR. Seed randomness, mock network calls, and put slow flows in `tests/integration` tagged `@pytest.mark.integration` so `pytest -m "not integration"` skips them.

## Commit & Pull Request Guidelines
History is greenfield; follow Conventional Commits (`feat(agents): add planner config`). Each commit handles one logical change and references issue IDs in the body. PRs should include a summary, test evidence (`make test`), UX artifacts when relevant, and callouts for follow-up work. Wait for green checks before merging.

## Security & Configuration Tips
Store secrets in `.env.local`; commit sanitized `.env.example`. Document third-party scopes in `docs/security.md` and list new binaries in `docs/dependencies.md`. Scan diffs for keys and rotate immediately if something leaks.

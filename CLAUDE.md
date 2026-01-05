# CLAUDE.md – Mentoroid Backend (`mentoroid-backend`)

You are assisting on the **`mentoroid-backend`** repository, which contains the cloud APIs for the Mentoroid platform.

---

### **ACTION: Incorporate Master Context**

Before proceeding, you **MUST** read and incorporate the rules and context from the master document located at `mentoroid-governance/MASTER_CLAUDE.md`. The rules in that file are global and apply to all repositories. This current file only contains context specific to `mentoroid-backend`.

---

### Project-Specific Context: `mentoroid-backend`

This repository contains the cloud APIs that power the pre-game and post-game analysis features.

### Tech Stack
- **Language:** Python 3.11+
- **Framework:** FastAPI
- **Runtime:** AWS Lambda via API Gateway
- **Database:** PostgreSQL (RDS)
- **Cache:** Redis (ElastiCache)
- **Storage:** S3 (for replays, model artifacts)
- **Queue:** SQS for async jobs (replay parsing)
- **Testing:** pytest
- **Packaging:** `uv`

### Common Commands
```bash
# Install/sync dependencies
uv sync

# Run local dev server (localhost:8000)
uv run fastapi dev

# Run tests
uv run pytest

# Lint and Format
uv run ruff check .
uv run ruff format .

# Type Check
uv run mypy .
```

### Directory Structure & Conventions
- **Tools:** Use `ruff` for linting/formatting and `mypy` for type checking.
- **Naming:** `snake_case` for files/functions, `PascalCase` for classes.
- **Structure:**
  ```
  src/
    app/
      api/           # FastAPI routers and endpoints
      core/          # Config, global deps, security
      models/        # SQLAlchemy (DB) and Pydantic (API) models
      services/      # Core business logic (e.g., draft analysis, replay orchestration)
      utils/         # Helper functions
  tests/
    unit/
    integration/
  ```
- **Error Handling:** Return consistent JSON envelopes from the API:
  ```python
  # Success
  {"success": True, "data": {...}, "error": None}
  # Failure
  {"success": False, "data": None, "error": {"code": "...", "message": "..."}}
  ```

### Testing Guidelines
- **Unit Tests:** For services and utils in `tests/unit/`.
- **Integration Tests:** For API endpoints in `tests/integration/`. Use `pytest-asyncio`.
- **Mocking:** Mock all external services (OpenDota, Stratz, S3, SQS) during tests.
- **Database:** Integration tests may use a test database, managed via fixtures.

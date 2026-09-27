# FIXTURE_NOTES.md — Team-only reference

> **Never copy this file into the demo workspace.**
> The reset script excludes it via `rsync --exclude FIXTURE_NOTES.md`.
> Bob must never see this file during the demo.

---

## The defect and why it is realistic

`compose.yaml` omits the `POSTGRES_HOST` key from the `app` service
environment block entirely. Because `config/settings.py` falls back to
`os.environ.get("POSTGRES_HOST", "localhost")`, the app container tries to
connect to PostgreSQL at `localhost:5432` inside its own container rather
than to the `db` service on the Docker network.

This is a real "works on my laptop" mistake: a developer running
`python manage.py runserver` locally with a local Postgres at localhost will
never see it fail. The same code, copied into Docker Compose without setting
`POSTGRES_HOST: db`, breaks immediately during `migrate`.

The `depends_on: db: condition: service_healthy` ensures the database IS
healthy before the app starts, so the failure is deterministically about the
wrong hostname, not a race.

---

## Expected failing output

`docker compose -p repo2prod-golden-demo up --build -d` exits 0.

Then after a few seconds, `docker compose -p repo2prod-golden-demo ps -a`
shows:

```
NAME                          IMAGE   COMMAND    SERVICE   CREATED         STATUS                     PORTS
repo2prod-golden-demo-app-1   ...     ...        app       5 seconds ago   Exited (1) 3 seconds ago
repo2prod-golden-demo-db-1    ...     ...        db        5 seconds ago   Up 5 seconds (healthy)
```

`docker compose -p repo2prod-golden-demo logs --no-color --tail 40 app`
shows (confirmed output from real run):

```
app-1  | django.db.utils.OperationalError: connection failed: connection to server at "127.0.0.1", port 5432 failed: Connection refused
app-1  | 	Is the server running on that host and accepting TCP/IP connections?
app-1  | Multiple connection attempts failed. All failures were:
app-1  | - host: 'localhost', port: '5432', hostaddr: '::1': connection failed: connection to server at "::1", port 5432 failed: Connection refused
app-1  | 	Is the server running on that host and accepting TCP/IP connections?
app-1  | - host: 'localhost', port: '5432', hostaddr: '127.0.0.1': connection failed: connection to server at "127.0.0.1", port 5432 failed: Connection refused
app-1  | 	Is the server running on that host and accepting TCP/IP connections?
```

Container status after ~10 seconds (`docker compose -p repo2prod-golden-demo ps -a`):
```
NAME                          IMAGE                       STATUS
repo2prod-golden-demo-app-1   repo2prod-golden-demo-app   Exited (1) 17 seconds ago
repo2prod-golden-demo-db-1    postgres:16-alpine          Up (healthy)
```

---

## Phase Repo2Prod should report

- `docker compose up -d` exit code: **0** — this is NOT success
- App container exit code: **1**
- Repo2Prod workflow phase: **STARTING**
- Failure signal: app container exited during startup (code 1)

Repo2Prod's verifier must check container state after `up -d` returns,
not just the compose process exit code. The STARTING phase means "containers
were created, but at least one exited non-zero before the health check."

---

## The known fix (manual verification only)

In the **demo copy** (`$HOME/repo2prod-demos/golden-demo/compose.yaml`),
add one line under `services.app.environment`:

```yaml
      POSTGRES_HOST: db
```

Then run:
```bash
docker compose -p repo2prod-golden-demo up --build -d
```

Wait ~10 seconds, then:
```bash
curl -s http://127.0.0.1:8000/health/
# Expected: {"status": "ok", "database": "ok"}
```

> **Rule: the Repo2Prod extension must never apply this fix automatically.**
> Only Bob's `/repo2prod-repair` command may fix it, after Repo2Prod has
> observed and recorded the failure.

---

## Expected healthy output

```
{"status": "ok", "database": "ok"}
```

HTTP 200.

Test run (after fix):
```
Ran 3 tests in X.XXXs

OK
```

---

## Reset script mechanics

The reset script lives at `scripts/reset-demo-fixture.sh` in the extension
repo. It:

1. Determines the demo destination:
   `DEMO_DIR="${REPO2PROD_DEMO_DIR:-$HOME/repo2prod-demos/golden-demo}"`

2. Uses compose project name: `repo2prod-golden-demo`
   (derived from `basename(DEMO_DIR)` lowercased with non-`[a-z0-9-]`
   characters replaced by `-`, then prefixed with `repo2prod-`).

3. Before deleting `DEMO_DIR`, requires the marker
   `.git/repo2prod-demo-marker` — this prevents accidental deletion of
   any other directory.

4. Tears down containers and volumes scoped to this project name only.
   Never runs `docker system prune` or `docker volume prune`.

5. Rsyncs the fixture source (excluding `FIXTURE_NOTES.md`, `__pycache__`,
   `*.pyc`, `.env`) to create a clean copy.

6. Generates a fresh `.env` with new `SECRET_KEY` and `POSTGRES_PASSWORD`
   values using `openssl rand`. The old pgdata volume is removed before
   rsync so the new password always initialises a fresh database.

7. Commits the clean state with `git init` so Repo2Prod's git-dirty guard
   passes.

8. `.env` is untracked and ignored (via `.gitignore` in the demo copy).

---

## Compose project name

Default: `repo2prod-golden-demo`

Override: set `REPO2PROD_DEMO_DIR` before running the reset script.
Example: `REPO2PROD_DEMO_DIR=/tmp/my-demo ./scripts/reset-demo-fixture.sh`
→ project name becomes `repo2prod-my-demo`.

# Inventory API

A small REST API for managing inventory items, built with Django and PostgreSQL.

## Endpoints

| Method | Path          | Description                          |
|--------|---------------|--------------------------------------|
| GET    | `/health/`    | Returns database connectivity status |
| GET    | `/api/items/` | List all items                       |
| POST   | `/api/items/` | Create a new item                    |

### Health check

```
GET /health/
```

Returns `200 {"status": "ok", "database": "ok"}` when the database is reachable,
or `503 {"status": "error", "database": "unavailable"}` when it is not.

### Create an item

```
POST /api/items/
Content-Type: application/json

{"name": "Widget"}
```

Returns `201` with the created item: `{"id": 1, "name": "Widget", "created_at": "..."}`.
Returns `400` when `name` is missing, empty, or longer than 100 characters.

### List items

```
GET /api/items/
```

Returns a JSON array of all items ordered by id.

## Environment variables

| Variable            | Required | Default             | Description                           |
|---------------------|----------|---------------------|---------------------------------------|
| `SECRET_KEY`        | yes      | —                   | Django secret key                     |
| `DEBUG`             | no       | `0`                 | Set to `1` to enable debug mode       |
| `ALLOWED_HOSTS`     | no       | `localhost,127.0.0.1` | Comma-separated list of allowed hosts |
| `POSTGRES_DB`       | no       | `inventory`         | PostgreSQL database name              |
| `POSTGRES_USER`     | no       | `inventory`         | PostgreSQL username                   |
| `POSTGRES_PASSWORD` | yes      | —                   | PostgreSQL password                   |
| `POSTGRES_HOST`     | no       | `localhost`         | PostgreSQL host                       |
| `POSTGRES_PORT`     | no       | `5432`              | PostgreSQL port                       |

## Running with Docker Compose

```bash
docker compose up --build
```

The application starts on port 8000. PostgreSQL data is persisted in the
`pgdata` volume.

## Running tests

```bash
docker compose run --rm app python manage.py test
```

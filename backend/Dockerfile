FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /bin/uv

# pg_dump and WAL-G, used by the nightly backup on Cloud Run (app/durability/backup.py).
ARG WALG_VERSION=v3.0.9
ARG TARGETARCH
RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg; \
    . /etc/os-release; \
    echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $VERSION_CODENAME-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-17; \
    rm -rf /var/lib/apt/lists/*; \
    case "$TARGETARCH" in \
      amd64) arch=amd64; sum=4f03ee4679db7f660bfd1b2b8291ac5df247cd2ec48074b60c112f4897299f24 ;; \
      arm64) arch=aarch64; sum=20191a37ad091a880c25f4cc907e6f0deb7f12bdd8a53fd62dbc7fcbf2eac712 ;; \
    esac; \
    curl -fsSL -o /tmp/wal-g.tar.gz \
      "https://github.com/wal-g/wal-g/releases/download/$WALG_VERSION/wal-g-pg-22.04-$arch.tar.gz"; \
    echo "$sum  /tmp/wal-g.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/wal-g.tar.gz -C /tmp; \
    mv "/tmp/wal-g-pg-22.04-$arch" /usr/local/bin/wal-g; \
    rm /tmp/wal-g.tar.gz

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers"]

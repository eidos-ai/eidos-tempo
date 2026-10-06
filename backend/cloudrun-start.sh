#!/bin/sh
# Backend start-up on Cloud Run: wait until the db container has restored the database, migrate, serve.
# One worker: on lease loss the process stops itself (app/durability/runtime.py).
set -eu
until [ -f /run/tempo/db-ready ]; do sleep 0.5; done
alembic upgrade head
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers

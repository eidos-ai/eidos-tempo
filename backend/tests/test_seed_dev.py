import pytest

from scripts.seed_dev import ensure_local_database


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
def test_seed_runs_against_a_local_database(host: str) -> None:
    ensure_local_database(f"postgresql+psycopg://tempo:tempo@{host}:5433/tempo")


@pytest.mark.parametrize("host", ["db", "tempo.example.com", "10.0.0.5"])
def test_seed_refuses_a_remote_database(host: str) -> None:
    with pytest.raises(SystemExit):
        ensure_local_database(f"postgresql+psycopg://tempo:secret@{host}:5432/tempo")

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import BackupCaller, BackupServiceDep

router = APIRouter(prefix="/internal", tags=["internal"])


class BackupOut(BaseModel):
    dump_object: str
    dump_bytes: int


@router.post("/backup")
def run_backup(_: BackupCaller, backups: BackupServiceDep) -> BackupOut:
    result = backups.run()
    return BackupOut(dump_object=result.dump_object, dump_bytes=result.dump_bytes)

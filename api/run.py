import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for name in ["database.env", "automation.env"]:
    path = root / ".runtime" / name
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key, value)
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "api"
    if mode == "worker":
        from shopeo.automation import main

        main()
    elif mode == "migrate":
        from alembic.config import Config
        from alembic import command

        command.upgrade(Config(str(Path(__file__).parent / "alembic.ini")), "head")
    else:
        import uvicorn

        uvicorn.run("shopeo.main:app", host="127.0.0.1", port=8100, access_log=False)

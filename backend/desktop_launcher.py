import os

import uvicorn

from app.main import app


def main() -> None:
    port = int(os.environ["GEO_DESKTOP_PORT"])
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()

from __future__ import annotations

import os
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

# Keep the real user workspace untouched when app.main is imported.
os.environ.setdefault("CAPTIONFORGE_HOME", tempfile.mkdtemp(prefix="cf-import-"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.security import TOKEN_HEADER  # noqa: E402


@pytest.fixture()
def client(tmp_path: Path):
    app = create_app(home=tmp_path / "home")
    with TestClient(app) as c:
        c.headers[TOKEN_HEADER] = app.state.token
        yield c


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("media") / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            str(path),
        ],
        check=True,
    )
    return path


def wait_for_jobs(client: TestClient, project_id: str, timeout: float = 20) -> list:
    deadline = time.time() + timeout
    while time.time() < deadline:
        jobs = client.get("/api/jobs", params={"projectId": project_id}).json()
        if jobs and all(j["status"] in ("complete", "failed", "cancelled") for j in jobs):
            return jobs
        time.sleep(0.1)
    raise AssertionError(f"jobs did not finish: {jobs}")

from __future__ import annotations

from fastapi.testclient import TestClient

from app.security import TOKEN_HEADER, sanitize_filename

from .conftest import wait_for_jobs


def project_doc(project_id: str = "proj_test", name: str = "Test") -> dict:
    return {
        "format": "cfproject",
        "schemaVersion": 1,
        "id": project_id,
        "name": name,
        "createdAt": "2026-09-30T00:00:00Z",
        "updatedAt": "2026-09-30T00:00:00Z",
        "captionTracks": [{"id": "t1", "name": "Captions", "language": "und", "cues": []}],
    }


def test_health_is_public_but_api_needs_token(client: TestClient):
    token = client.headers.pop(TOKEN_HEADER)
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/projects").status_code == 401
    client.headers[TOKEN_HEADER] = token
    assert client.get("/api/projects").status_code == 200


def test_rejects_foreign_host(client: TestClient):
    assert client.get("/api/health", headers={"host": "evil.example"}).status_code == 403


def test_runtime_reports_components(client: TestClient):
    data = client.get("/api/runtime").json()
    names = {c["name"] for c in data["components"]}
    assert {"Python", "SQLite", "FFmpeg", "FFprobe", "Remotion", "WhisperX"} <= names
    assert data["databaseSchema"] == 2


def test_project_crud_and_versions(client: TestClient):
    assert client.post("/api/projects", json={"document": project_doc()}).status_code == 201
    assert client.post("/api/projects", json={"document": project_doc()}).status_code == 409
    listing = client.get("/api/projects").json()
    assert [p["name"] for p in listing] == ["Test"]

    doc = client.get("/api/projects/proj_test").json()
    doc["name"] = "Renamed"
    assert client.put("/api/projects/proj_test", json={"document": doc, "reason": "manual"}).status_code == 200
    assert client.get("/api/projects/proj_test").json()["name"] == "Renamed"
    versions = client.get("/api/projects/proj_test/versions").json()
    assert [v["reason"] for v in versions] == ["manual", "created"]

    assert client.put("/api/projects/other", json={"document": doc}).status_code == 422
    assert client.delete("/api/projects/proj_test").status_code == 204
    assert client.get("/api/projects/proj_test").status_code == 404


def test_rejects_invalid_documents(client: TestClient):
    assert client.post("/api/projects", json={"document": {"format": "x"}}).status_code == 422
    assert client.post("/api/projects", json={"document": project_doc("../etc")}).status_code == 422


def test_media_import_probe_and_derived_assets(client: TestClient, sample_video):
    client.post("/api/projects", json={"document": project_doc()})
    resp = client.post(
        "/api/media/import",
        params={"filename": "../../My Clip!.mp4", "projectId": "proj_test"},
        content=sample_video.read_bytes(),
    )
    assert resp.status_code == 201, resp.text
    asset = resp.json()
    assert asset["name"] == "My Clip_.mp4"
    assert asset["kind"] == "video"
    assert asset["width"] == 320 and asset["height"] == 240
    assert asset["fps"] == 30
    assert 1900 <= asset["durationMs"] <= 2100

    jobs = wait_for_jobs(client, "proj_test")
    assert {j["kind"]: j["status"] for j in jobs} == {"waveform": "complete", "thumbnail": "complete"}

    waveform = client.get(f"/api/media/{asset['id']}/waveform").json()
    assert waveform["peaksPerSecond"] == 100
    assert len(waveform["peaks"]) >= 190
    assert max(waveform["peaks"]) > 0.1
    assert client.get(f"/api/media/{asset['id']}/thumbnail").headers["content-type"] == "image/jpeg"

    ranged = client.get(f"/api/media/{asset['id']}/file", headers={"range": "bytes=0-99"})
    assert ranged.status_code == 206 and len(ranged.content) == 100

    assert client.delete(f"/api/media/{asset['id']}").status_code == 204
    assert client.get(f"/api/media/{asset['id']}").status_code == 404


def test_media_import_rejects_bad_files(client: TestClient):
    assert client.post("/api/media/import", params={"filename": "x.exe"}, content=b"MZ").status_code == 415
    bad = client.post("/api/media/import", params={"filename": "fake.mp4"}, content=b"not a video")
    assert bad.status_code == 422


def test_unavailable_runtimes_fail_clearly(client: TestClient, monkeypatch):
    from app.services import ai

    monkeypatch.setenv("CAPTIONFORGE_AI_PYTHON", "/nonexistent/python")
    ai._versions_cache.update(at=0.0, value=None)
    client.post("/api/projects", json={"document": project_doc()})
    job = client.post("/api/transcriptions", json={"projectId": "proj_test", "payload": {}}).json()
    assert job["status"] == "queued"
    jobs = wait_for_jobs(client, "proj_test")
    assert jobs[0]["status"] == "failed"
    assert "npm run setup:ai" in jobs[0]["error"]
    ai._versions_cache.update(at=0.0, value=None)


def test_sanitize_filename():
    assert sanitize_filename("../../a/b\\c.mp4") == "c.mp4"
    assert sanitize_filename("...") == "file"


def test_templates_crud_duplicate_and_variant(client: TestClient):
    config = {"fontFamily": "Inter", "fontSize": 82, "activeColor": "#00E676"}
    created = client.post("/api/templates", json={"name": "My Bold Pop", "styleId": "bold-pop", "config": config})
    assert created.status_code == 201
    tpl = created.json()
    assert tpl["styleId"] == "bold-pop" and tpl["config"] == config

    updated = client.put(f"/api/templates/{tpl['id']}", json={"config": {**config, "activeColor": "#FF0000"}}).json()
    assert updated["config"]["activeColor"] == "#FF0000"

    copy = client.post(f"/api/templates/{tpl['id']}/duplicate", json={}).json()
    variant = client.post(f"/api/templates/{tpl['id']}/duplicate", json={"variant": True}).json()
    assert copy["name"] == "My Bold Pop copy" and copy["parentId"] is None
    assert variant["name"] == "My Bold Pop variant" and variant["parentId"] == tpl["id"]
    assert len(client.get("/api/templates").json()) == 3

    assert client.delete(f"/api/templates/{tpl['id']}").status_code == 204
    remaining = client.get("/api/templates").json()
    assert len(remaining) == 2 and all(t["parentId"] is None for t in remaining)
    assert client.post("/api/templates", json={"name": "", "styleId": "bold-pop", "config": {}}).status_code == 422


def test_render_mp4_end_to_end(client: TestClient, sample_video):
    """Real Remotion render through the job queue, verified with FFprobe."""
    import json
    from pathlib import Path

    from app.services.render import renderer_available

    if not renderer_available():
        import pytest

        pytest.skip("Remotion renderer not installed")
    doc = json.loads((Path(__file__).parent / "fixtures" / "project.json").read_text())
    client.post("/api/projects", json={"document": doc})
    asset = client.post(
        "/api/media/import", params={"filename": "clip.mp4", "projectId": doc["id"]}, content=sample_video.read_bytes()
    ).json()
    doc["primaryVideoId"] = asset["id"]
    client.put(f"/api/projects/{doc['id']}", json={"document": doc})

    job = client.post("/api/renders", json={"projectId": doc["id"], "payload": {"format": "mp4"}}).json()
    jobs = wait_for_jobs(client, doc["id"], timeout=300)
    render = next(j for j in jobs if j["id"] == job["id"])
    assert render["status"] == "complete", render["error"]
    result = client.get(f"/api/jobs/{job['id']}").json()["result"]
    assert result["verified"] and result["width"] == 320 and result["height"] == 240
    assert 1900 <= result["durationMs"] <= 2200
    file = client.get(f"/api/renders/{job['id']}/file")
    assert file.status_code == 200 and len(file.content) == result["sizeBytes"]


def test_render_mp4_high_quality_keeps_bt709_colour(client: TestClient, sample_video):
    """High quality MP4: lossless frames and BT.709 colour; unknown qualities are rejected."""
    import json
    import subprocess
    from pathlib import Path

    from app.services.media import binary
    from app.services.render import renderer_available

    if not renderer_available():
        import pytest

        pytest.skip("Remotion renderer not installed")
    doc = json.loads((Path(__file__).parent / "fixtures" / "project.json").read_text())
    client.post("/api/projects", json={"document": doc})
    asset = client.post(
        "/api/media/import", params={"filename": "clip.mp4", "projectId": doc["id"]}, content=sample_video.read_bytes()
    ).json()
    doc["primaryVideoId"] = asset["id"]
    client.put(f"/api/projects/{doc['id']}", json={"document": doc})

    bad = client.post("/api/renders", json={"projectId": doc["id"], "payload": {"format": "mp4", "quality": "ultra"}}).json()
    job = client.post("/api/renders", json={"projectId": doc["id"], "payload": {"format": "mp4", "quality": "high"}}).json()
    jobs = {j["id"]: j for j in wait_for_jobs(client, doc["id"], timeout=300)}
    assert jobs[bad["id"]]["status"] == "failed" and "quality" in jobs[bad["id"]]["error"]
    assert jobs[job["id"]]["status"] == "complete", jobs[job["id"]]["error"]
    result = client.get(f"/api/jobs/{job['id']}").json()["result"]
    assert result["verified"] and result["quality"] == "high"
    colour = subprocess.run(
        [binary("ffprobe"), "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_space", "-of", "csv=p=0", result["path"]],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    assert colour == "bt709"


def test_render_karaoke_transparent_webm(client: TestClient):
    """Karaoke (pill mode) captions-only render with a verified alpha channel."""
    import json
    from pathlib import Path

    from app.services.render import renderer_available

    if not renderer_available():
        import pytest

        pytest.skip("Remotion renderer not installed")
    doc = json.loads((Path(__file__).parent / "fixtures" / "project.json").read_text())
    doc["id"] = "proj_karaoke"
    doc["captionStyle"] = {
        "styleId": "karaoke",
        "templateId": None,
        "config": {**doc["captionStyle"]["config"], "activeAnimation": "highlight", "popScale": 1.06, "activeScaleWithEffects": True},
    }
    client.post("/api/projects", json={"document": doc})
    job = client.post("/api/renders", json={"projectId": doc["id"], "payload": {"format": "webm-alpha"}}).json()
    jobs = wait_for_jobs(client, doc["id"], timeout=300)
    render = next(j for j in jobs if j["id"] == job["id"])
    assert render["status"] == "complete", render["error"]
    assert render["result"]["file"].endswith(".webm") and render["result"]["verified"]


def test_render_prores_4444_with_alpha_for_premiere(client: TestClient):
    """Captions-only ProRes 4444 .mov with an alpha channel (what Premiere Pro imports)."""
    import json
    import subprocess
    from pathlib import Path

    from app.services.render import renderer_available

    if not renderer_available():
        import pytest

        pytest.skip("Remotion renderer not installed")
    doc = json.loads((Path(__file__).parent / "fixtures" / "project.json").read_text())
    doc["id"] = "proj_prores"
    client.post("/api/projects", json={"document": doc})
    job = client.post("/api/renders", json={"projectId": doc["id"], "payload": {"format": "mov-alpha"}}).json()
    jobs = wait_for_jobs(client, doc["id"], timeout=300)
    render = next(j for j in jobs if j["id"] == job["id"])
    assert render["status"] == "complete", render["error"]
    path = render["result"]["path"]
    assert path.endswith(".mov")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,pix_fmt", "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["codec_name"] == "prores" and "4444" in stream["profile"] and stream["pix_fmt"].startswith("yuva")


def test_render_quicktime_png_with_alpha(client: TestClient):
    """Smaller lossless alternative to ProRes: QuickTime PNG .mov with alpha."""
    import json
    import subprocess
    from pathlib import Path

    from app.services.render import renderer_available

    if not renderer_available():
        import pytest

        pytest.skip("Remotion renderer not installed")
    doc = json.loads((Path(__file__).parent / "fixtures" / "project.json").read_text())
    doc["id"] = "proj_pngmov"
    client.post("/api/projects", json={"document": doc})
    job = client.post("/api/renders", json={"projectId": doc["id"], "payload": {"format": "mov-png"}}).json()
    jobs = wait_for_jobs(client, doc["id"], timeout=300)
    render = next(j for j in jobs if j["id"] == job["id"])
    assert render["status"] == "complete", render["error"]
    path = render["result"]["path"]
    assert path.endswith(".mov") and render["result"]["verified"]
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,r_frame_rate", "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream == {"codec_name": "png", "pix_fmt": "rgba", "r_frame_rate": "30/1"}


def test_ai_status_and_token_setting(client: TestClient):
    status = client.get("/api/ai").json()
    assert {m["name"] for m in status["models"]} == {"small", "medium", "large-v3-turbo", "large-v3"}
    assert status["hfTokenSet"] is False
    assert client.put("/api/ai/settings", json={"hfToken": "hf_test"}).json() == {"hfTokenSet": True}
    assert client.get("/api/ai").json()["hfTokenSet"] is True
    assert client.put("/api/ai/settings", json={"hfToken": None}).json() == {"hfTokenSet": False}


def test_transcription_rejects_unknown_model(client: TestClient, sample_video):
    from app.services import ai

    if not ai.ai_available():
        import pytest

        pytest.skip("AI runtime not installed")
    client.post("/api/projects", json={"document": project_doc()})
    asset = client.post("/api/media/import", params={"filename": "clip.mp4", "projectId": "proj_test"}, content=sample_video.read_bytes()).json()
    client.post("/api/transcriptions", json={"projectId": "proj_test", "payload": {"mediaId": asset["id"], "model": "huge"}})
    jobs = wait_for_jobs(client, "proj_test")
    failed = [j for j in jobs if j["kind"] == "transcription"][0]
    assert failed["status"] == "failed" and "Unknown model" in failed["error"]


def test_duplicate_project_shares_media_safely(client: TestClient, sample_video):
    client.post("/api/projects", json={"document": project_doc()})
    asset = client.post("/api/media/import", params={"filename": "clip.mp4", "projectId": "proj_test"}, content=sample_video.read_bytes()).json()
    wait_for_jobs(client, "proj_test")
    doc = client.get("/api/projects/proj_test").json()
    doc.update(primaryVideoId=asset["id"], media=[{"id": asset["id"], "kind": "video", "name": "clip.mp4"}])
    client.put("/api/projects/proj_test", json={"document": doc})

    copy = client.post("/api/projects/proj_test/duplicate", json={"name": "Test (French)"}).json()
    assert copy["name"] == "Test (French)" and copy["id"] != "proj_test"
    copy_doc = client.get(f"/api/projects/{copy['id']}").json()
    new_media = copy_doc["primaryVideoId"]
    assert new_media != asset["id"] and copy_doc["media"][0]["id"] == new_media
    assert [m["id"] for m in client.get(f"/api/media?projectId={copy['id']}").json()] == [new_media]
    assert client.get(f"/api/media/{new_media}/thumbnail").status_code == 200

    # Deleting the original must not delete the video the copy still uses.
    assert client.delete("/api/projects/proj_test").status_code == 204
    ranged = client.get(f"/api/media/{new_media}/file", headers={"range": "bytes=0-9"})
    assert ranged.status_code == 206
    # Deleting the last user removes the file.
    client.delete(f"/api/projects/{copy['id']}")
    assert client.get(f"/api/media/{new_media}/file").status_code == 404


def test_production_mode_serves_web_app_with_token_cookie(tmp_path, monkeypatch):
    """Production mode: the API serves the built app and hands the browser the token as a strict cookie."""
    from fastapi.testclient import TestClient as Client

    from app.main import create_app

    web = tmp_path / "web"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text("<html>CaptionForge</html>")
    (web / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setenv("CAPTIONFORGE_STATIC", str(web))
    with Client(create_app(home=tmp_path / "home")) as c:
        page = c.get("/")
        assert page.status_code == 200 and "CaptionForge" in page.text
        cookie = page.headers["set-cookie"].lower()
        assert "captionforge_token=" in cookie and "httponly" in cookie and "samesite=strict" in cookie
        assert c.get("/assets/app.js").text == "console.log(1)"
        assert "CaptionForge" in c.get("/project/abc").text  # client-side route
        # The cookie alone authorises API calls; without it they are refused.
        assert c.get("/api/projects").status_code == 200
        c.cookies.clear()
        assert c.get("/api/projects").status_code == 401
        assert c.get("/", headers={"host": "evil.example"}).status_code == 403


def test_ai_runtime_location_prefers_workspace(tmp_path, monkeypatch):
    from app.services import ai, ai_install

    monkeypatch.delenv("CAPTIONFORGE_AI_PYTHON", raising=False)
    monkeypatch.setenv("CAPTIONFORGE_HOME", str(tmp_path))
    workspace_python = ai_install.env_python(tmp_path / "runtime")
    workspace_python.parent.mkdir(parents=True)
    workspace_python.write_text("")
    assert ai.ai_python() == workspace_python

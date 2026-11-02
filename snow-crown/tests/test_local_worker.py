"""Behavioral checks for the local worker; no model or Roblox required."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "local_worker.py"
spec = importlib.util.spec_from_file_location("snow_local_worker", MODULE_PATH)
worker = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(worker)


class FakeModel(BaseHTTPRequestHandler):
    response = {}
    received = None
    authorization = None

    def log_message(self, *args):
        pass

    def send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/v1/models":
            self.send_error(404)
            return
        self.send_json({"data": [{"id": "fake-local-model"}]})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        FakeModel.received = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeModel.authorization = self.headers.get("Authorization")
        self.send_json({"choices": [{"message": {"content": json.dumps(FakeModel.response)}, "finish_reason": "stop"}]})


class LocalWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeModel)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.endpoint = f"http://127.0.0.1:{cls.server.server_port}/v1/chat/completions"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "jobs").mkdir()
        (self.root / "src").mkdir()
        (self.root / "src" / "example.luau").write_text("return 1\n", encoding="utf-8")
        self.job = {
            "task": "Return a small, valid change.",
            "read": ["src/example.luau"],
            "write": ["src/example.luau"],
            "max_tokens": 512,
        }
        self.write_job()
        FakeModel.response = {"summary": "Change example", "files": [{"path": "src/example.luau", "content": "return 2\n"}], "notes": []}
        FakeModel.received = None
        self.env = mock.patch.dict(os.environ, {
            "SNOW_WORKER_URL": self.endpoint,
            "SNOW_WORKER_MODEL": "fake-local-model",
            "SNOW_WORKER_API_KEY": "test-key",
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def write_job(self):
        (self.root / "jobs" / "job.json").write_text(json.dumps(self.job), encoding="utf-8")

    def test_doctor_and_propose_review_apply(self):
        self.assertEqual(worker.doctor(), ["fake-local-model"])
        output, proposal = worker.propose(self.root, "jobs/job.json")
        self.assertTrue(output.is_file())
        self.assertEqual((self.root / "src/example.luau").read_text(), "return 1\n")
        self.assertEqual(FakeModel.received["model"], "fake-local-model")
        self.assertEqual(FakeModel.authorization, "Bearer test-key")
        request_data = json.loads(FakeModel.received["messages"][1]["content"])
        self.assertEqual(request_data["context"][0]["content"], "return 1\n")
        loaded = worker.load_proposal(self.root, output.relative_to(self.root).as_posix())
        self.assertEqual(loaded["summary"], proposal["summary"])
        worker.apply(self.root, loaded)
        self.assertEqual((self.root / "src/example.luau").read_text(), "return 2\n")

    def test_documented_cli_workflow_in_an_independent_project(self):
        (self.root / "tools").mkdir()
        tool_path = self.root / "tools" / "local_worker.py"
        shutil.copyfile(MODULE_PATH, tool_path)

        def run(*args):
            return subprocess.run(
                [sys.executable, str(tool_path), *args],
                cwd=self.root,
                text=True,
                capture_output=True,
                check=True,
            ).stdout

        self.assertIn("fake-local-model", run("doctor"))
        result = run("propose", "--job", "jobs/job.json")
        proposal_path = next(line.removeprefix("Proposal: ") for line in result.splitlines() if line.startswith("Proposal: "))
        self.assertIn("+return 2", run("show", proposal_path))
        self.assertEqual((self.root / "src/example.luau").read_text(), "return 1\n")
        run("apply", proposal_path)
        self.assertEqual((self.root / "src/example.luau").read_text(), "return 2\n")

    def test_model_cannot_select_an_unapproved_file(self):
        FakeModel.response["files"][0]["path"] = "src/other.luau"
        with self.assertRaisesRegex(worker.WorkerError, "unapproved"):
            worker.propose(self.root, "jobs/job.json")
        self.assertFalse((self.root / "src/other.luau").exists())

    def test_all_targets_checked_before_any_write(self):
        (self.root / "src/second.luau").write_text("original\n", encoding="utf-8")
        self.job["write"].append("src/second.luau")
        self.write_job()
        FakeModel.response["files"].append({"path": "src/second.luau", "content": "proposed\n"})
        _, proposal = worker.propose(self.root, "jobs/job.json")
        (self.root / "src/second.luau").write_text("changed elsewhere\n", encoding="utf-8")
        with self.assertRaisesRegex(worker.WorkerError, "changed since"):
            worker.apply(self.root, proposal)
        self.assertEqual((self.root / "src/example.luau").read_text(), "return 1\n")

    def test_path_traversal_and_git_directory_are_rejected(self):
        for name in ("../outside", "/tmp/outside", "src/../../outside", ".git/config", "C:/other", "src/./example.luau"):
            with self.subTest(name=name), self.assertRaises(worker.WorkerError):
                worker.project_path(self.root, name)

    def test_changed_job_cannot_expand_a_saved_proposal(self):
        output, proposal = worker.propose(self.root, "jobs/job.json")
        proposal["files"][0]["path"] = "src/unapproved.luau"
        output.write_text(json.dumps(proposal), encoding="utf-8")
        with self.assertRaisesRegex(worker.WorkerError, "Unapproved"):
            worker.load_proposal(self.root, output.relative_to(self.root).as_posix())

    def test_empty_proposal_is_valid_and_does_not_modify_files(self):
        FakeModel.response = {"summary": "No change needed", "files": [], "notes": []}
        _, proposal = worker.propose(self.root, "jobs/job.json")
        worker.apply(self.root, proposal)
        self.assertEqual((self.root / "src/example.luau").read_text(), "return 1\n")

    def test_truncated_model_output_is_rejected(self):
        with self.assertRaisesRegex(worker.WorkerError, "truncated"):
            worker.parse_model_response({"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]})

    def test_model_may_wrap_valid_json_in_a_code_fence(self):
        result = worker.parse_model_response({"choices": [{"message": {"content": '```json\n{"summary":"ok","files":[]}\n```'}}]})
        self.assertEqual(result["summary"], "ok")


if __name__ == "__main__":
    unittest.main()

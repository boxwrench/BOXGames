"""Offline structure and reproducibility tests; opening Studio remains required."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("snow_build_place", ROOT / "tools" / "build_place.py")
build = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(build)


def child(parent, class_name, name):
    matches = [item for item in parent.findall("Item") if item.get("class") == class_name and item.findtext("Properties/string[@name='Name']") == name]
    if len(matches) != 1:
        raise AssertionError(f"Expected {class_name}/{name}; found {len(matches)}")
    return matches[0]


class BuildPlaceTests(unittest.TestCase):
    def setUp(self):
        self.data = build.build_place()
        self.root = ET.fromstring(self.data)

    def test_committed_template_matches_current_sources(self):
        self.assertEqual(self.data, (ROOT / "place/SnowCrownDev.template.rbxlx").read_bytes())
        self.assertEqual(self.data, build.build_place())

    def test_place_has_baseplate_spawn_and_empty_runtime_folders(self):
        workspace = child(self.root, "Workspace", "Workspace")
        child(workspace, "Part", "Baseplate")
        spawn = child(workspace, "SpawnLocation", "SpawnLocation")
        self.assertEqual(spawn.findtext("Properties/bool[@name='Anchored']"), "true")
        self.assertEqual(spawn.findtext("Properties/CoordinateFrame[@name='CFrame']/Y"), "0.6")
        runtime = child(workspace, "Folder", "SnowCrownRuntime")
        for name in ("Arena", "SpawnPoints", "ActiveAbilities", "CosmeticAnchors"):
            self.assertEqual(child(runtime, "Folder", name).findall("Item"), [])

    def test_embedded_scripts_match_source_and_execution_context(self):
        shared = child(child(child(self.root, "ReplicatedStorage", "ReplicatedStorage"), "Folder", "SnowCrown"), "Folder", "Shared")
        config = child(shared, "ModuleScript", "Config")
        self.assertEqual(config.findtext("Properties/ProtectedString[@name='Source']"), (ROOT / "src/shared/Config.luau").read_text())

        server = child(child(self.root, "ServerScriptService", "ServerScriptService"), "Folder", "SnowCrownServer")
        for name, path in (("Bootstrap", "src/server/Bootstrap.server.luau"), ("WorkshopSmokeTest", "src/server/WorkshopSmokeTest.server.luau")):
            script = child(server, "Script", name)
            self.assertEqual(script.findtext("Properties/token[@name='RunContext']"), "1")
            self.assertEqual(script.findtext("Properties/ProtectedString[@name='Source']"), (ROOT / path).read_text())

        starter = child(child(self.root, "StarterPlayer", "StarterPlayer"), "StarterPlayerScripts", "StarterPlayerScripts")
        client = child(starter, "Folder", "SnowCrownClient")
        bootstrap = child(client, "LocalScript", "Bootstrap")
        self.assertEqual(bootstrap.findtext("Properties/ProtectedString[@name='Source']"), (ROOT / "src/client/Bootstrap.local.luau").read_text())
        self.assertFalse(any(item.get("class") == "Script" for item in client.iter("Item")))

    def test_referents_are_unique_and_references_resolve(self):
        refs = [item.get("referent") for item in self.root.iter("Item")]
        self.assertNotIn(None, refs)
        self.assertEqual(len(refs), len(set(refs)))
        for ref in self.root.iter("Ref"):
            self.assertIn(ref.text, set(refs) | {None, "null", "nil"})

    def test_generator_refuses_to_replace_an_existing_place(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "existing.rbxlx"
            target.write_text("keep my edits", encoding="utf-8")
            result = subprocess.run([sys.executable, str(ROOT / "tools/build_place.py"), "--output", str(target)], text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(), "keep my edits")


if __name__ == "__main__":
    unittest.main()

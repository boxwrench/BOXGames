#!/usr/bin/env python3
"""Build an unverified Plateau 0 place from local source and licensed fixtures.

This is an offline convenience, not a substitute for opening it in Roblox
Studio. Existing output files are never overwritten.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
from pathlib import Path
import sys
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "third_party" / "roblox-test-files"
ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")


class BuildError(Exception):
    pass


def named_child(parent: ET.Element, class_name: str, name: str | None = None) -> ET.Element:
    found = [child for child in parent.findall("Item") if child.get("class") == class_name]
    if name is not None:
        found = [child for child in found if child.findtext("Properties/string[@name='Name']") == name]
    if len(found) != 1:
        raise BuildError(f"Expected one {class_name} named {name!r}; found {len(found)}")
    return found[0]


def build_place(root_dir: Path = ROOT) -> bytes:
    fixtures = root_dir / "third_party" / "roblox-test-files"
    try:
        root = ET.parse(fixtures / "baseplate-413.rbxlx").getroot()
        templates = ET.parse(fixtures / "object-prototypes.rbxmx").getroot()
    except (OSError, ET.ParseError) as exc:
        raise BuildError(f"Cannot read Roblox fixture: {exc}") from exc
    if root.tag != "roblox" or root.get("version") != "4":
        raise BuildError("Unexpected baseplate file format")
    if any(item.get("class") in ("Script", "LocalScript", "ModuleScript") for item in root.iter("Item")):
        raise BuildError("Baseplate fixture unexpectedly contains a script")

    refs = [item.get("referent") for item in root.iter("Item")]
    if None in refs or len(refs) != len(set(refs)):
        raise BuildError("Baseplate referents are missing or duplicated")
    used_refs = set(refs)

    def make(class_name: str, name: str, logical_path: str) -> ET.Element:
        item = deepcopy(named_child(templates, class_name))
        ref = "RBX" + hashlib.sha256(logical_path.encode("utf-8")).hexdigest()[:32].upper()
        if ref in used_refs:
            raise BuildError(f"Duplicate referent for {logical_path}")
        used_refs.add(ref)
        item.set("referent", ref)
        name_property = item.find("Properties/string[@name='Name']")
        if name_property is None:
            raise BuildError(f"Template missing Name for {class_name}")
        name_property.text = name
        item.tail = None
        return item

    def folder(parent: ET.Element, name: str, path: str) -> ET.Element:
        if any(item.findtext("Properties/string[@name='Name']") == name for item in parent.findall("Item")):
            raise BuildError(f"Fixture already has {path}")
        item = make("Folder", name, path)
        parent.append(item)
        return item

    def script(parent: ET.Element, class_name: str, name: str, path: str, source: str, *, server: bool = False) -> None:
        item = make(class_name, name, path)
        source_property = item.find("Properties/ProtectedString[@name='Source']")
        if source_property is None:
            raise BuildError(f"Template missing Source for {class_name}")
        try:
            source_property.text = (root_dir / source).read_text(encoding="utf-8")
        except OSError as exc:
            raise BuildError(f"Cannot read source {source}: {exc}") from exc
        if server:
            # Roblox Enum.RunContext.Server = 1. LocalScripts have no RunContext.
            properties = item.find("Properties")
            assert properties is not None
            ET.SubElement(properties, "token", {"name": "RunContext"}).text = "1"
        parent.append(item)

    workspace = named_child(root, "Workspace")
    if any(item.get("class") == "SpawnLocation" for item in workspace.findall("Item")):
        raise BuildError("Baseplate fixture already contains a spawn")
    spawn = make("SpawnLocation", "SpawnLocation", "Workspace/SpawnLocation")
    anchored = spawn.find("Properties/bool[@name='Anchored']")
    height = spawn.find("Properties/CoordinateFrame[@name='CFrame']/Y")
    if anchored is None or height is None:
        raise BuildError("Spawn prototype is missing position or Anchored")
    anchored.text = "true"
    height.text = "0.6"  # Bottom rests on the fixture baseplate, whose top is y=0.
    workspace.append(spawn)

    runtime = folder(workspace, "SnowCrownRuntime", "Workspace/SnowCrownRuntime")
    for name in ("Arena", "SpawnPoints", "ActiveAbilities", "CosmeticAnchors"):
        folder(runtime, name, "Workspace/SnowCrownRuntime/" + name)

    replicated = named_child(root, "ReplicatedStorage")
    shared_root = folder(replicated, "SnowCrown", "ReplicatedStorage/SnowCrown")
    shared = folder(shared_root, "Shared", "ReplicatedStorage/SnowCrown/Shared")
    folder(shared_root, "Remotes", "ReplicatedStorage/SnowCrown/Remotes")
    script(shared, "ModuleScript", "Config", "ReplicatedStorage/SnowCrown/Shared/Config", "src/shared/Config.luau")

    server_root = folder(named_child(root, "ServerScriptService"), "SnowCrownServer", "ServerScriptService/SnowCrownServer")
    script(server_root, "Script", "Bootstrap", "ServerScriptService/SnowCrownServer/Bootstrap", "src/server/Bootstrap.server.luau", server=True)
    script(server_root, "Script", "WorkshopSmokeTest", "ServerScriptService/SnowCrownServer/WorkshopSmokeTest", "src/server/WorkshopSmokeTest.server.luau", server=True)

    starter = named_child(named_child(root, "StarterPlayer"), "StarterPlayerScripts")
    client = folder(starter, "SnowCrownClient", "StarterPlayer/StarterPlayerScripts/SnowCrownClient")
    script(client, "LocalScript", "Bootstrap", "StarterPlayer/StarterPlayerScripts/SnowCrownClient/Bootstrap", "src/client/Bootstrap.local.luau")

    assets = folder(named_child(root, "ServerStorage"), "SnowCrownAssets", "ServerStorage/SnowCrownAssets")
    for name in ("Maps", "Boards", "EffectTemplates"):
        folder(assets, name, "ServerStorage/SnowCrownAssets/" + name)

    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--output", type=Path, help="New output path; must not already exist")
    mode.add_argument("--check", type=Path, help="Compare an existing file with generated output")
    args = parser.parse_args()
    try:
        data = build_place()
        if args.check:
            if args.check.read_bytes() != data:
                raise BuildError(f"Place differs from source: {args.check}")
            print(f"Place matches source: {args.check}")
        else:
            output = args.output or ROOT / "build" / "SnowCrownDev.generated.rbxlx"
            output.parent.mkdir(parents=True, exist_ok=True)
            with output.open("xb") as handle:
                handle.write(data)
            print(f"Wrote {output}; Studio validation is still required")
    except (BuildError, OSError) as exc:
        print(f"Place build: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

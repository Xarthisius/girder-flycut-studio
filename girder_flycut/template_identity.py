"""Resolve generated LightBurn layouts back to their original template."""

import copy
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path


def id_cut(root):
    return next(
        (
            cut
            for cut in root.findall(".//CutSetting")
            if cut.find("name") is not None and cut.find("name").get("Value", "").lower() == "id"
        ),
        None,
    )


def stamp_template(root, template_name):
    cut = id_cut(root)
    if cut is None:
        used = {int(c.find("index").get("Value")) for c in root.findall(".//CutSetting") if c.find("index") is not None}
        free = next((i for i in range(29, -1, -1) if i not in used), None)
        if free is None:
            raise ValueError("No free layer for template identity.")
        cut = ET.SubElement(root, "CutSetting", {"type": "Cut"})
        for key, value in [("index", str(free)), ("name", "id"), ("doOutput", "0")]:
            ET.SubElement(cut, key, {"Value": value})
    subname = cut.find("subname")
    if subname is None:
        subname = ET.SubElement(cut, "subname")
    if not template_name or len(template_name) > 16 or Path(template_name).name != template_name:
        raise ValueError("Template ID must be a unique name of at most 16 characters.")
    subname.set("Value", template_name)


def resolve_template(path, reference_dirs=()):
    path = Path(path)
    root = ET.parse(path).getroot()
    cut = id_cut(root)
    subname = cut.find("subname") if cut is not None else None
    source = subname.get("Value", "") if subname is not None else ""
    proxy = bool(source.lower().endswith(".lbrn2"))
    if proxy and Path(source).name != source:
        raise ValueError("Template subname must be a filename, not a path.")
    original = source if proxy else path.name
    if source and not proxy:
        matches = []
        for directory in dict.fromkeys([path.parent, *map(Path, reference_dirs)]):
            for candidate in directory.glob("*.json"):
                entry = json.loads(candidate.read_text())
                if (
                    entry.get("template_id") or hashlib.sha256(str(entry.get("template", "")).encode()).hexdigest()[:12]
                ) == source:
                    matches.append(entry["template"])
        if len(set(matches)) > 1:
            raise ValueError("Template ID matches multiple original templates.")
        if matches:
            original = matches[0]
            proxy = True
    candidates = [
        directory / Path(original).with_suffix(".json") for directory in [path.parent, *map(Path, reference_dirs)]
    ]
    sidecar = next((candidate for candidate in candidates if candidate.is_file()), None)
    if sidecar is None:
        raise FileNotFoundError(f"Original template sidecar not found for {original}")
    data = json.loads(sidecar.read_text())
    if data.get("template") != original:
        raise ValueError("Template sidecar identity does not match its filename.")
    data = copy.deepcopy(data)
    if proxy and str(data.get("placeholder_id", "")).lower() not in {"", "none"}:
        index = cut.find("index").get("Value")
        labels = {
            shape.get("Str", "")
            for shape in root.findall(".//Shape[@Type='Text']")
            if shape.get("CutIndex") == index and shape.get("Str", "").strip()
        }
        if len(labels) != 1:
            raise ValueError("Cannot determine the current stack ID: expected one distinct text value on the id layer.")
        data["placeholder_id"] = labels.pop()
    return sidecar, data

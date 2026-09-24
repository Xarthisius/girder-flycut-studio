"""Small, bounded generation jobs over the packaged, trusted template catalog."""
import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

from . import engine
from .template_identity import resolve_template, stamp_template
from .validation import assignment_options

INPUTS = Path(__file__).parent / "inputs"


def generate(config, portal_template=None, material_record=None, lifecycle=None):
    run = config["run_params"]
    material_path = Path(run["foil_material"])
    template_path = INPUTS / "templates" / run["template"]
    material = {'material': material_record or {'igsn': run['foil_material'], 'name': run['foil_material']}}
    lifecycle = lifecycle or {}
    if portal_template is None:
        _, sidecar = resolve_template(template_path, [INPUTS / "templates"])
        root = ET.parse(template_path).getroot()
    else:
        _, root, sidecar = portal_template
    layers = list(dict.fromkeys(f["layer"] for f in sidecar["physical_flyers"]))
    repeat, wraparound = assignment_options(config["laser_assignment"])
    lasers = config["laser_params"]
    mapping = {}
    groups = {}
    aliases = {"power": "maxPower", "speed": "speed", "qpulsewidth": "QPulseWidth", "frequency": "frequency", "passes": "numPasses"}
    for pos, layer in enumerate(layers):
        index = pos // repeat
        if wraparound:
            index %= len(lasers)
        assigned = index < len(lasers) and lasers[index].get("enabled", True)
        if assigned:
            values = {dest: lasers[index][src] for src, dest in aliases.items()}
            if not engine.apply_cut_defaults_to_flyer(root, int(layer[1:]), values):
                raise ValueError(f"Template has no cut setting for {layer}.")
        # For exact mode, unassigned layers retain their actual template settings.
        cut = engine.get_cut(root, layer)
        if cut is None:
            raise ValueError(f"Missing template layer {layer}.")
        mapping[layer] = {key: cut.find(key).get("Value") if cut.find(key) is not None else "" for key in aliases.values()}
        signature = tuple(float(mapping[layer][key]) for key in aliases.values())
        mapping[layer]['group'] = ('default' if lasers[index].get('is_default') else groups.setdefault(signature, layer)) if assigned else 'T' + layer 
    placeholder = str(sidecar.get("placeholder_id", "")).strip()
    if placeholder.lower() not in {"none", ""} and not engine.rename_text_exact(root, placeholder, run["stackid"]):
        raise ValueError("Template stack ID placeholder was not found.")
    stamp_template(root, sidecar.get("template_id") or hashlib.sha256(sidecar["template"].encode()).hexdigest()[:12])
    fields = config.get("custom_fields", {})
    legacy = {"ID": run["stackid"], "operator": run["operator"]}
    stem = f"stack{run['stackid']}"
    rows = engine.build_physical_flyer_csv_rows(legacy, material, sidecar, Path(stem + '-layout.lbrn2'), mapping, datetime.now(timezone.utc).isoformat())
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    metadata = engine.build_output_metadata(legacy, material, material_path, sidecar, {}, Path(stem + '-layout.lbrn2'), "Girder Flyer Studio v1.0", True, True, rows)
    metadata['template']['name'] = portal_template[0].get('label', sidecar['template']) if portal_template else sidecar['template']
    metadata['unique_safe'] = True
    metadata['overwrite_safe'] = lifecycle.get('overwriteSafe', True)
    metadata['material'] = {key: material['material'].get(key) for key in ('igsn', 'name')}
    metadata.update({f'time_{key}': (lifecycle[value].isoformat() if hasattr(lifecycle.get(value), 'isoformat') else lifecycle.get(value)) for key, value in [('submitted','submittedAt'), ('generated','generatedAt'), ('registered','registeredAt'), ('machined','machinedAt')]})
    metadata.pop("thickness", None)
    metadata["material"].pop("thickness_um", None)
    metadata.update({"createdBy": config["createdBy"], "custom_fields": fields})
    return {
        stem + '-layout.lbrn2': (ET.tostring(root, encoding='utf-8', xml_declaration=True), 'application/xml'),
        stem + '-inventory.csv': (text.getvalue().encode(), 'text/csv'),
        stem + '-metadata.json': (json.dumps(metadata, indent=2, allow_nan=False).encode(), 'application/json'),
    }

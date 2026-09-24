"""Validation shared by API persistence and unit tests."""
import copy
import json
import math
import re
from .schema import unpack


def normalize_config(config, user, catalog, submitted=False):
    if not isinstance(config, dict):
        raise ValueError("Configuration must be an object.")
    if len(json.dumps(config, allow_nan=False).encode()) > 256 * 1024:
        raise ValueError("Configuration exceeds 256 KB.")
    config = unpack(config)
    run = config.get("run_params")
    if not isinstance(run, dict):
        raise ValueError("Missing run parameters.")
    stack = run.get("stackid", "")
    valid_stack = isinstance(stack, str) and bool(re.fullmatch(r"(?:[0-9A-HJKMNP-TV-Z]{5}|F[0-9]{3,4})", stack))
    if not valid_stack:
        raise ValueError("Stack ID must match F###, F####, or five uppercase Crockford Base32 characters.")
    for field, collection in [("foil_material", "materials"), ("template", "templates")]:
        if run.get(field) not in {entry["id"] for entry in catalog[collection]}:
            raise ValueError(f"Choose a valid {field}.")
    run["operator"] = (run.get("operator") or user["login"]) if submitted else user["login"]
    config["createdBy"] = str(user["_id"])
    assignment = config.get("laser_assignment")
    repeat, wraparound = assignment_options(assignment)
    config["laser_assignment"] = {"repeat": repeat, "wraparound": wraparound}
    lasers = config.get("laser_params")
    if not isinstance(lasers, list) or not 1 <= len(lasers) <= 28:
        raise ValueError("Provide between 1 and 28 laser settings.")
    colors = set()
    for laser in lasers:
        if not isinstance(laser, dict):
            raise ValueError("Invalid laser setting.")
        if type(laser.get("enabled", True)) is not bool:
            raise ValueError("Layer enabled must be a boolean.")
        laser.setdefault("enabled", True)
        color = laser.get("color", "")
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color) or color.lower() in colors:
            raise ValueError("Laser colors must be unique six-digit hex colors.")
        colors.add(color.lower())
        for field in ["power", "speed", "qpulsewidth", "frequency", "passes"]:
            value = laser.get(field)
            # Older disabled snapshots stored null instead of their settings.
            if value is None and not laser["enabled"]:
                continue
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError(f"Laser {field} must be a finite nonnegative number.")
        if laser.get("passes") is not None and (laser["passes"] < 1 or laser["passes"] != int(laser["passes"])):
            raise ValueError("Passes must be a positive integer.")
    fields = config.get("custom_fields", {})
    if not isinstance(fields, dict) or any(not k.strip() or (not (submitted and v is None) and (not isinstance(v, (str, int, float)) or not str(v).strip())) for k, v in fields.items()):
        raise ValueError("Custom fields require names and values.")
    return config


def assignment_options(assignment):
    """Read current controls or preserve the meaning of legacy saved configs."""
    if not isinstance(assignment, dict):
        raise ValueError("Missing laser assignment.")
    if "repeat" in assignment or "wraparound" in assignment:
        repeat = assignment.get("repeat", 1)
        wraparound = assignment.get("wraparound", True)
    else:
        style = assignment.get("style")
        if style not in {"exact", "cycle", "repeat"}:
            raise ValueError("Invalid laser assignment style.")
        repeat = assignment.get("x", 1) if style == "repeat" else 1
        wraparound = style != "exact"
    if type(repeat) is not int or not 1 <= repeat <= 10000:
        raise ValueError("Repeat count must be an integer between 1 and 10000.")
    if type(wraparound) is not bool:
        raise ValueError("Allow wraparound must be a boolean.")
    return repeat, wraparound


def normalize_builder_config(config, user, catalog):
    """Persist builder exports after checking blocking requirements."""
    if not isinstance(config, dict) or len(json.dumps(config, allow_nan=False).encode()) > 256 * 1024:
        raise ValueError('Configuration must be an object no larger than 256 KB.')
    result = copy.deepcopy(config)
    run = result.get('run_params')
    if not isinstance(run, dict) or not isinstance(run.get('stackid'), str) or not run['stackid'].strip():
        raise ValueError('Stack ID is required.')
    if not re.fullmatch(r'(?:F[0-9]{3,4}|[0-9A-HJKMNP-TV-Z]{5})', run['stackid'].strip()):
        raise ValueError('Stack ID must match F###, F####, or five uppercase Crockford Base32 characters.')
    for field, collection in [('template', 'templates'), ('foil_material', 'materials')]:
        if not run.get(field) or run[field] not in {entry['id'] for entry in catalog[collection]}:
            raise ValueError(f'Invalid {field} selection.')
    lasers = result.get('laser_params', [])
    if not isinstance(lasers, list) or not any(isinstance(laser, dict) and laser.get('enabled', True) is not False for laser in lasers):
        raise ValueError('Enable at least one laser parameter entry.')
    fields = result.get('custom_fields', {})
    if not isinstance(fields, dict) or any(not name.strip() and value is not None and str(value).strip() for name, value in fields.items()):
        raise ValueError('Custom fields with values need names.')
    # Presets are disabled; retain explicit settings/custom fields from old configs.
    result['preset'] = None
    result['custom_fields'] = {name: value if value is not None and str(value).strip() else None for name, value in fields.items() if name.strip()}
    run['stackid'] = run['stackid'].strip()
    run['operator'] = str(run.get('operator') or '').strip() or user['login']
    result['createdBy'] = str(user['_id'])
    return result


def builder_warnings(config, catalog):
    run = config.get('run_params', {})
    warnings = []
    if not str(run.get('operator') or '').strip():
        warnings.append('Operator fallback')
    lasers = config.get('laser_params', [])
    if any(laser.get('enabled', True) and laser.get('is_default') for laser in lasers):
        warnings.append('Default laser parameters')
    repeat, wrap = assignment_options(config.get('laser_assignment', {}))
    layers = catalog.get('details', {}).get(run.get('template'), {}).get('layers', [])
    used = set()
    for position in range(len(layers)):
        index = position // repeat
        if wrap and lasers:
            index %= len(lasers)
        if index < len(lasers) and lasers[index].get('enabled', True):
            used.add(index)
        else:
            warnings.append('Unspecified template flyers')
    if any(not laser.get('enabled', True) or index not in used for index, laser in enumerate(lasers)):
        warnings.append('Unused laser entries')
    if any(value is None or not str(value).strip() for value in config.get('custom_fields', {}).values()):
        warnings.append('Empty custom values')
    return warnings

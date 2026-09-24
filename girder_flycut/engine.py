# Generated from cfstack.py by build_dashboard.py.
from __future__ import annotations
from pathlib import Path
from decimal import Decimal, InvalidOperation
import xml.etree.ElementTree as ET


def require(cond: bool, msg: str) -> None:
    """
    require: Assert that a condition is true, otherwise raise a ValueError with the provided message.
    """
    if not cond:
        raise ValueError(msg)

def _float(value, default: float) -> float:
    """
    _float: Convert a value to a float, returning a default if conversion fails.
    """
    try:
        return float(value)
    except Exception:
        return default

def normalize_thickness(cfg: dict, igsn_cfg: dict) -> dict:
    """
    normalize_thickness: Resolve missing thickness values using defaults. 
    """
    foil_default = igsn_cfg.get("material", {}).get("thickness_um", None)
    foil_default = _float(foil_default, 0.0) if foil_default is not None else None

    glass_cfg = (cfg.get("thickness", {}) or {}).get("glass", {}) or {}
    foil_cfg = (cfg.get("thickness", {}) or {}).get("foil", {}) or {}

    resolved = {
        "glass": {
            "tl_mm": _float(glass_cfg.get("tl_mm", 6.25), 6.25),
            "tr_mm": _float(glass_cfg.get("tr_mm", 6.25), 6.25),
            "bl_mm": _float(glass_cfg.get("bl_mm", 6.25), 6.25),
            "br_mm": _float(glass_cfg.get("br_mm", 6.25), 6.25),
        },
        "foil": {
            "tl_um": _float(foil_cfg.get("tl_um", foil_default), foil_default or 0.0),
            "tr_um": _float(foil_cfg.get("tr_um", foil_default), foil_default or 0.0),
            "bl_um": _float(foil_cfg.get("bl_um", foil_default), foil_default or 0.0),
            "br_um": _float(foil_cfg.get("br_um", foil_default), foil_default or 0.0),
        },
    }

    for bucket, suffix in ((resolved["glass"], "mm"), (resolved["foil"], "um")):
        for k, v in bucket.items():
            require(v > 0, f"Resolved thickness value must be > 0: {bucket}.{k}")

    return resolved

def _format_flyer_number(value):
    """Round flyer metadata numbers to at most two relevant decimal places."""
    if value in (None, ""):
        return ""
    try:
        decimal_value = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, AttributeError):
        return value

    rounded = decimal_value.quantize(Decimal("0.01"))
    if rounded == rounded.to_integral():
        return int(rounded)
    return float(rounded)

def build_physical_flyer_csv_rows(
    cfg: dict,
    igsn_cfg: dict,
    template_sidecar: dict,
    output_lbrn_path: Path,
    layer_assignment_map: dict[str, dict],
    run_timestamp: str,
) -> list[dict]:
    """Build one CSV summary row per physical flyer in the template sidecar."""
    rows: list[dict] = []
    foil_igsn = str(igsn_cfg.get("material", {}).get("igsn", "")).strip()
    stack_id = str(cfg.get("ID", "")).strip()

    for flyer in template_sidecar.get("physical_flyers", []):
        layer = str(flyer.get("layer", "")).strip()
        position = str(flyer.get("position", "")).strip()
        assigned = layer_assignment_map.get(layer, {})
        source_row = assigned.get("excel_row_1based", "")
        source = f"E{source_row}" if str(source_row).strip() else "default"

        rows.append(
            {
                "foil_igsn": foil_igsn,
                "stack_id": stack_id,
                "flyer_pos": position,
                "group": assigned.get("group", source),
                "status": "specified",
                "laser_maxpower": assigned.get("maxPower", ""),
                "laser_qpulsewidth": assigned.get("QPulseWidth", ""),
                "laser_speed": assigned.get("speed", ""),
                "laser_frequency": assigned.get("frequency", ""),
                "laser_numpasses": assigned.get("numPasses", ""),
                "time_registered": "",
                "time_machined": "",
                "time_retired": "",
            }
        )

    return rows

def build_output_metadata(
    cfg: dict,
    igsn_cfg: dict,
    igsn_path: Path,
    template_sidecar: dict,
    resolved_thickness: dict,
    output_lbrn_path: Path,
    source_label: str,
    overwrite_safe: bool,
    unique_safe: bool,
    csv_rows: list[dict],
) -> dict:
    """Build the JSON metadata companion file for an output set."""
    sidecar_flyers = {
        str(flyer.get("position", "")).strip(): flyer
        for flyer in template_sidecar.get("physical_flyers", [])
    }
    material_cfg = igsn_cfg.get("material", {}) or {}
    flyers: list[dict] = []

    for row in csv_rows:
        sidecar = sidecar_flyers.get(row["flyer_pos"], {})
        flyers.append(
            {
                "position": row["flyer_pos"],
                "layer": sidecar.get("layer", ""),
                "xpos": _format_flyer_number(sidecar.get("xpos", "")),
                "ypos": _format_flyer_number(sidecar.get("ypos", "")),
                "group": row.get("group", ""),
                "laser_maxpower": _format_flyer_number(row.get("laser_maxpower", "")),
                "laser_qpulsewidth": _format_flyer_number(row.get("laser_qpulsewidth", "")),
                "laser_speed": _format_flyer_number(row.get("laser_speed", "")),
                "laser_frequency": _format_flyer_number(row.get("laser_frequency", "")),
                "laser_numpasses": _format_flyer_number(row.get("laser_numpasses", "")),
            }
        )

    return {
        "ID": str(cfg.get("ID", "")).strip(),
        "operator": str(cfg.get("operator", "")).strip(),
        "template": {
            "name": str(template_sidecar.get("template", "")).strip(),
            "version": str(template_sidecar.get("version", "")).strip(),
            "created": str(template_sidecar.get("timestamp", "")).strip(),
        },
        "thickness": resolved_thickness,
        "material": {
            "name": material_cfg.get("name", ""),
            "local_id": material_cfg.get("local_id", ""),
            "igsn": material_cfg.get("igsn", ""),
            "thickness_um": material_cfg.get("thickness_um", ""),
            "config_name": igsn_path.name,
            "config_version": igsn_cfg.get("version", ""),
            "config_created": str(igsn_cfg.get("timestamp", "")).strip(),
        },
        "overwrite_safe": overwrite_safe,
        "unique_safe": unique_safe and overwrite_safe,
        "source": source_label,
        "flyers": flyers,
    }

def get_cut(root: ET.Element, name: str):
    """
    get_cut: Find a CutSetting element by name, case-insensitive. Returns None if not found.
    """
    search_norm = name.strip().lower()
    for cut in root.findall(".//CutSetting"):
        name_elem = cut.find("./name")
        if name_elem is None:
            continue
        name_val = (name_elem.get("Value") or (name_elem.text or "")).strip()
        if name_val.lower() == search_norm:
            return cut
    return None

def rename_text_exact(root: ET.Element, old_text: str, new_text: str, case_insensitive: bool = True) -> int:
    """
    rename_text_exact: Rename all Shape elements of Type='Text' with Str matching old_text to new_text.
      - Used to update template ID placeholder.
    """
    changed = 0
    for shape in root.findall(".//Shape[@Type='Text']"):
        s = shape.get("Str", "")
        if (s.lower() == old_text.lower()) if case_insensitive else (s == old_text):
            shape.set("Str", new_text)
            changed += 1
    return changed

def apply_cut_defaults_to_flyer(root: ET.Element, flyer_number: int, cut_defaults: dict, flyer_prefix: str = "F") -> bool:
    """
    apply_cut_defaults_to_flyer: Apply default laser parameters (igsn-config) to the CutSetting of a given flyer number in the XML.
    """
    cut_name = f"{flyer_prefix}{int(flyer_number)}"
    cut = get_cut(root, cut_name)
    if cut is None:
        return False

    applied_any = False
    for key, val in (cut_defaults or {}).items():
        if val is None:
            continue
        elem = cut.find(f"./{key}")
        if elem is None:
            elem = ET.SubElement(cut, key)
        elem.set("Value", str(val))
        applied_any = True
    return applied_any

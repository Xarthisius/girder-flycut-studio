"""Public section-based JSON with legacy save compatibility."""

import copy


def unpack(config):
    if "run_parameters" not in config:
        return copy.deepcopy(config)
    laser = config.get("laser_parameters", {})
    result = {
        "preset": config.get("preset"),
        "run_params": config.get("run_parameters", {}),
        "laser_assignment": {"repeat": laser.get("repeat", 1), "wraparound": laser.get("wraparound", True)},
        "parameter_import_file": laser.get("import_file"),
        "laser_params": laser.get("flyers", []),
        "custom_fields": config.get("custom_fields", {}),
    }
    if "createdBy" in config:
        result["createdBy"] = config["createdBy"]
    return result


def pack(config):
    config = unpack(config)
    keys = [
        "name",
        "enabled",
        "is_default",
        "from_import",
        "color",
        "power",
        "speed",
        "qpulsewidth",
        "frequency",
        "passes",
    ]
    flyers = [
        {
            key: laser.get(key, True if key == "enabled" else False if key in {"is_default", "from_import"} else None)
            for key in keys
        }
        for laser in config.get("laser_params", [])
    ]
    result = {
        "preset": config.get("preset"),
        "run_parameters": config.get("run_params", {}),
        "laser_parameters": {
            **config.get("laser_assignment", {}),
            "import_file": config.get("parameter_import_file"),
            "flyers": flyers,
        },
        "custom_fields": config.get("custom_fields", {}),
    }
    if "createdBy" in config:
        result["createdBy"] = config["createdBy"]
    return result


def stack_id(config):
    """The stack ID a configuration claims, normalised the one way everything compares it.

    Every comparison of two stack IDs -- the mutex's key, collision detection,
    the reuse rules the client reads -- has to agree on this, and it used to be
    written out by hand in four modules. `validate.normalize_config` already
    refuses anything but `F###`, `F####` or five uppercase Crockford Base32
    characters, so upper-casing is a no-op on a configuration that was ever
    submitted; it is here for the ones that were not.
    """
    return str(unpack(config).get("run_params", {}).get("stackid", "")).strip().upper()

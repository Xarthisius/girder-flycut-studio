"""Flyer Studio conventions for local IGSN metadata."""

import copy


def is_test_run(config):
    value = config.get("custom_fields", {}).get("test_run")
    if value is None or value == "":
        return False
    value = str(value).strip().lower()
    if value in {"true", "yes", "1", "on"}:
        return True
    if value in {"false", "no", "0", "off"}:
        return False
    raise ValueError("test_run must be true or false (yes/no and 1/0 are also accepted).")


def identifiers(*values):
    return [{"alternateIdentifier": value, "alternateIdentifierType": "Local"} for value in values]


def stack_metadata(parent_metadata, user, stack_id, test_run):
    metadata = copy.deepcopy(parent_metadata)
    metadata["creators"] = [
        {
            "name": (user.get("firstName", "") + " " + user.get("lastName", "")).strip() or user["login"],
            "nameType": "Personal",
            "givenName": user.get("firstName", ""),
            "familyName": user.get("lastName", ""),
        }
    ]
    metadata["alternateIdentifiers"] = identifiers(
        "stack-igsn", "stack-" + stack_id, *(["stack-test"] if test_run else [])
    )
    # The stack's source is the selected foil, not every ancestor of that foil.
    metadata["relatedIdentifiers"] = []
    return metadata


def foil_identifiers(metadata, test_run=False):
    existing = metadata.get("alternateIdentifiers", [])
    # Replace the old marker, preserving descriptive local IDs and other IDs.
    result = [
        entry
        for entry in existing
        if not (
            entry.get("alternateIdentifierType", "").lower() == "local"
            and entry.get("alternateIdentifier", "").lower() in {"foiligsn", "foil-igsn"}
        )
    ]
    result = identifiers("foil-igsn") + result
    if test_run and not any(entry.get("alternateIdentifier") == "foil-test" for entry in result):
        result += identifiers("foil-test")
    return result

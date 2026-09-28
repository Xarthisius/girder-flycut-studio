"""Validated dashboard policy; Girder IDs remain stable across renames."""

import copy
import math

from bson import ObjectId
from girder.constants import AccessType
from girder.exceptions import RestException, ValidationException
from girder.models.folder import Folder
from girder.models.group import Group
from girder.models.user import User
from girder.utility.path import getResourcePath, lookUpPath
from girder_dashboards.models.dashboard import Dashboard

from . import KEY

DEFAULTS = dict(
    creators=[],
    creators_include_user=True,
    owners=[],
    editors=[],
    viewers=[],
    owners_include_user=False,
    editors_include_user=True,
    viewers_include_user=False,
    public_igsn=False,
    public_files=False,
    workspace_path="",
    workspace_folder_id="",
    laser_defaults={"maxPower": 60, "speed": 100, "QPulseWidth": 200, "frequency": 100, "numPasses": 1},
)


def policy():
    doc = Dashboard().findOne({"key": KEY})
    return {**copy.deepcopy(DEFAULTS), **(doc or {}).get("settings", {})}


# The policy's own shape, group by group. `validate_settings` runs them in this
# order, which is the order the config page presents them in -- an operator
# fixing one message at a time should not be sent back up the form.
FLAGS = (
    "creators_include_user",
    "owners_include_user",
    "editors_include_user",
    "viewers_include_user",
    "public_igsn",
    "public_files",
)
PRINCIPALS = ("creators", "owners", "editors", "viewers")
LASER_DEFAULTS = {"maxPower", "speed", "QPulseWidth", "frequency", "numPasses"}


def _validate_laser_defaults(defaults):
    """The starting values a new laser layer is built from."""
    if not isinstance(defaults, dict) or set(defaults) != LASER_DEFAULTS:
        raise ValidationException("laser_defaults must contain maxPower, speed, QPulseWidth, frequency, and numPasses.")
    if (
        any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in defaults.values())
        or defaults["maxPower"] > 100
        or defaults["speed"] <= 0
        or defaults["numPasses"] < 1
        or defaults["numPasses"] != int(defaults["numPasses"])
    ):
        raise ValidationException(
            "Invalid laser_defaults: use finite positive speed, power 0–100, "
            "nonnegative values, and integer passes >= 1."
        )


def _validate_flags(result):
    for key in FLAGS:
        if type(result[key]) is not bool:
            raise ValidationException(f"{key} must be a boolean.")


def _normalize_principals(result):
    """Resolve each role's users and groups, dropping duplicates.

    Stored by ID rather than by name, so a rename does not silently change who
    a workspace belongs to -- and refused outright when the entity is gone,
    because a policy naming a deleted group grants nothing and says nothing.
    """
    for key in PRINCIPALS:
        entries = result[key]
        if not isinstance(entries, list):
            raise ValidationException(f"{key} must be a list of users/groups.")
        normalized = []
        for entry in entries:
            if (
                not isinstance(entry, dict)
                or entry.get("type") not in ("user", "group")
                or not ObjectId.is_valid(entry.get("id", ""))
            ):
                raise ValidationException(f"{key}: select a valid user or group.")
            model = User() if entry["type"] == "user" else Group()
            entity = model.load(entry["id"], force=True)
            if not entity:
                raise ValidationException(f"{key}: user/group no longer exists.")
            ref = {"type": entry["type"], "id": str(entity["_id"])}
            if ref not in normalized:
                normalized.append(ref)
        result[key] = normalized


def _resolve_workspace(result):
    """Settle the workspace on one folder, named both ways.

    An ID and a path may both arrive; the ID wins, and whichever identified the
    folder, both are written back from it. That is what keeps the setting
    working after the folder is renamed or moved.
    """
    destination = result.get("workspace_folder_id")
    path = result.get("workspace_path")
    if not isinstance(path, str) or not isinstance(destination, str):
        raise ValidationException("Workspace must be a folder path or ID.")
    folder = None
    if destination:
        if not ObjectId.is_valid(destination):
            raise ValidationException("Invalid workspace folder ID.")
        folder = Folder().load(destination, force=True)
    elif path.strip():
        try:
            resource = lookUpPath(path.strip(), force=True)
        except Exception as exc:
            raise ValidationException("Workspace path does not identify an existing collection folder.") from exc
        if resource and resource["model"] == "folder":
            folder = resource["document"]
    if not destination and not path.strip():
        # No workspace configured at all is a valid policy: the dashboard says
        # so and refuses to save anything until an administrator sets one.
        return
    if not folder or folder.get("baseParentType") != "collection":
        raise ValidationException("Select a folder inside a Girder collection for the workspace.")
    if not result["owners"] and not result["owners_include_user"]:
        raise ValidationException("Configure an owner user/group, or include the acting user as owner.")
    result["workspace_folder_id"] = str(folder["_id"])
    result["workspace_path"] = getResourcePath("folder", folder, force=True)


def validate_settings(settings):
    """The dashboard policy, checked group by group and returned normalised."""
    result = {**copy.deepcopy(DEFAULTS), **settings}
    _validate_laser_defaults(result["laser_defaults"])
    _validate_flags(result)
    _normalize_principals(result)
    if not result["creators"] and not result["creators_include_user"]:
        raise ValidationException("Configure an IGSN creator or include the registrant.")
    _resolve_workspace(result)
    return result


def validate_dashboard(event):
    doc = event.info
    if doc.get("key") == KEY:
        doc["settings"] = validate_settings(doc.get("settings", {}))


def workspace(user, write=False):
    identifier = policy()["workspace_folder_id"]
    if not identifier:
        if write:
            raise RestException("An administrator must configure the Flyer Studio workspace first.", code=409)
        return None
    return Folder().load(identifier, user=user, level=AccessType.WRITE if write else AccessType.READ, exc=True)


def access_list(settings, actor):
    levels = {"users": {}, "groups": {}}
    for role, level in [("viewers", AccessType.READ), ("editors", AccessType.WRITE), ("owners", AccessType.ADMIN)]:
        entries = list(settings[role])
        if settings[role + "_include_user"]:
            entries.append({"type": "user", "id": str(actor["_id"])})
        for entry in entries:
            bucket = levels["users" if entry["type"] == "user" else "groups"]
            bucket[entry["id"]] = max(level, bucket.get(entry["id"], -1))
    return {
        kind: [{"id": ObjectId(identifier), "level": level} for identifier, level in entries.items()]
        for kind, entries in levels.items()
    }


def apply_access(model, doc, settings, actor, igsn=False):
    model.setAccessList(doc, access_list(settings, actor), user=actor, save=False)
    model.setPublic(doc, settings["public_igsn" if igsn else "public_files"], save=False)
    doc["publicFlags"] = []
    return model.save(doc)


def creators(settings, actor):
    entries = list(settings["creators"])
    if settings["creators_include_user"]:
        entries.append({"type": "user", "id": str(actor["_id"])})
    result, seen = [], set()
    for entry in entries:
        key = (entry["type"], entry["id"])
        if key in seen:
            continue
        seen.add(key)
        entity = (User() if entry["type"] == "user" else Group()).load(entry["id"], force=True, exc=True)
        if entry["type"] == "group":
            result.append({"name": entity["name"], "nameType": "Organizational"})
        else:
            result.append(
                {
                    "name": (entity.get("firstName", "") + " " + entity.get("lastName", "")).strip() or entity["login"],
                    "nameType": "Personal",
                    "givenName": entity.get("firstName", ""),
                    "familyName": entity.get("lastName", ""),
                }
            )
    if not result:
        raise RestException("Configure at least one IGSN creator or enable creators_include_user.", code=409)
    return result

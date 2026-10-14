"""Discover JSON uploads in the workspace's managed Drafts folder."""

import json
from datetime import datetime, timedelta, timezone

from girder.constants import AccessType
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item

from .artifacts import CONFIG_FIELD
from .models.config import FlycutConfig
from .schema import unpack
from .storage import draft_root


def _reject_constant(value):
    raise ValueError(f"Non-finite JSON number: {value}")


def import_uploads(workspace, user):
    """Import readable, writable uploads without applying submission validation.

    Only direct uploads are discovered. Moving each into its own draft folder
    preserves the stack-folder lifecycle when the operator later submits it.
    Malformed or unrelated JSON remains in place for the uploader to correct.
    """
    if not Folder().hasAccess(workspace, user, AccessType.WRITE):
        return
    root = draft_root(workspace, user)
    for item in Item().find({"folderId": root["_id"], CONFIG_FIELD: {"$exists": False}}):
        if not Item().hasAccess(item, user, AccessType.WRITE):
            continue
        files = list(File().find({"itemId": item["_id"]}))
        if len(files) != 1 or not files[0]["name"].lower().endswith(".json") or files[0]["size"] > 256 * 1024:
            continue
        try:
            with File().open(files[0]) as stream:
                config = json.load(stream, parse_constant=_reject_constant)
            if not isinstance(config, dict):
                continue
            form = unpack(config)
            if not isinstance(form.get("run_params"), dict) or not isinstance(form.get("laser_params"), list):
                continue
            if any(not isinstance(row, dict) for row in form["laser_params"]):
                continue
            if not isinstance(form.get("custom_fields", {}), dict):
                continue
        except (ValueError, TypeError, AttributeError, UnicodeError):
            continue
        # Only one simultaneous list refresh may import an upload. The lease
        # expires so a process interrupted before moving the item can retry.
        now = datetime.now(timezone.utc)
        claim = Item().collection.update_one(
            {
                "_id": item["_id"],
                "folderId": root["_id"],
                CONFIG_FIELD: {"$exists": False},
                "$or": [
                    {"flycutDraftImport": {"$exists": False}},
                    {"flycutDraftImport": {"$lt": now - timedelta(minutes=5)}},
                ],
            },
            {"$set": {"flycutDraftImport": now}},
        )
        if not claim.modified_count:
            continue
        try:
            folder = Folder().createFolder(root, "draft-" + str(item["_id"]), creator=user, reuseExisting=True)
            Folder().setAccessList(folder, root.get("access", {}), user=user, save=True)
            item = Item().move(item, folder)
            item[CONFIG_FIELD] = config
            item.setdefault("meta", {})["flycut"] = {
                "status": "draft",
                "workspaceId": str(workspace["_id"]),
                "createdBy": str(user["_id"]),
                "savedAt": datetime.now(timezone.utc),
                "overwriteSafe": True,
                "customFieldRows": config.get("custom_field_rows", []),
            }
            FlycutConfig().save(item)
        finally:
            Item().collection.update_one({"_id": item["_id"]}, {"$unset": {"flycutDraftImport": ""}})

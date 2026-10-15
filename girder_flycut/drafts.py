"""Discover JSON uploads in the workspace's managed Drafts folder."""

import json
import logging
from datetime import datetime, timedelta, timezone

from girder.constants import AccessType
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item

from .artifacts import CONFIG_FIELD
from .models.config import FlycutConfig
from .schema import unpack
from .storage import existing_draft_root

logger = logging.getLogger(__name__)

# What an upload that is not a configuration is marked with, so that the next
# listing skips it without reading it again. Keyed to the file it describes:
# replace the upload and the new one is examined afresh.
REJECTED_FIELD = "flycutDraftRejected"


def _reject_constant(value):
    raise ValueError(f"Non-finite JSON number: {value}")


def _is_rejected(item, file):
    marker = item.get(REJECTED_FIELD)
    return bool(marker) and marker.get("fileId") == file["_id"] and marker.get("size") == file.get("size")


def _reject(item, file):
    Item().collection.update_one(
        {"_id": item["_id"]},
        {"$set": {REJECTED_FIELD: {"fileId": file["_id"], "size": file.get("size")}}},
    )


def _configuration_in(file):
    """The configuration an upload holds, or None when it is not one.

    Reading the file is the expensive half of a listing request, which is why
    the caller records the answer rather than asking again every time.
    """
    try:
        with File().open(file) as stream:
            config = json.load(stream, parse_constant=_reject_constant)
        if not isinstance(config, dict):
            return None
        form = unpack(config)
        if not isinstance(form.get("run_params"), dict) or not isinstance(form.get("laser_params"), list):
            return None
        if any(not isinstance(row, dict) for row in form["laser_params"]):
            return None
        if not isinstance(form.get("custom_fields", {}), dict):
            return None
    except (ValueError, TypeError, AttributeError, UnicodeError):
        return None
    return config


def _claim(item, root):
    """Take the import lease, or report that someone else holds it.

    The lease expires so a process interrupted before moving the item can
    retry.
    """
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
    return bool(claim.modified_count)


def _adopt(item, config, root, workspace, user):
    """Move one upload into a draft folder of its own and record it as a draft."""
    folder = Folder().createFolder(root, "draft-" + str(item["_id"]), creator=user, reuseExisting=True)
    Folder().setAccessList(folder, root.get("access", {}), user=user, save=True)
    # Whoever uploaded the file owns the draft. `user` is merely whoever
    # refreshed the listing first, which in a shared workspace is routinely
    # somebody else.
    uploader = item.get("creatorId") or user["_id"]
    item = Item().move(item, folder)
    item[CONFIG_FIELD] = config
    item.setdefault("meta", {})["flycut"] = {
        "status": "draft",
        "workspaceId": str(workspace["_id"]),
        "createdBy": str(uploader),
        "savedAt": datetime.now(timezone.utc),
        "overwriteSafe": True,
        "customFieldRows": config.get("custom_field_rows", []),
    }
    FlycutConfig().save(item)


def import_uploads(workspace, user):
    """Import readable, writable uploads without applying submission validation.

    Only direct uploads are discovered. Moving each into its own draft folder
    preserves the stack-folder lifecycle when the operator later submits it.
    Malformed or unrelated JSON remains in place for the uploader to correct.

    This runs on every listing request, so no upload may cost more than the
    first look at it and no upload may fail the listing: one that cannot be
    imported is logged and left behind.
    """
    if not Folder().hasAccess(workspace, user, AccessType.WRITE):
        return
    root = existing_draft_root(workspace)
    if not root:
        return
    for item in Item().find({"folderId": root["_id"], CONFIG_FIELD: {"$exists": False}}):
        if not Item().hasAccess(item, user, AccessType.WRITE):
            continue
        files = list(File().find({"itemId": item["_id"]}))
        if len(files) != 1 or not files[0]["name"].lower().endswith(".json") or files[0]["size"] > 256 * 1024:
            continue
        if _is_rejected(item, files[0]):
            continue
        config = _configuration_in(files[0])
        if config is None:
            _reject(item, files[0])
            continue
        # Only one simultaneous list refresh may import an upload.
        if not _claim(item, root):
            continue
        try:
            _adopt(item, config, root, workspace, user)
        except Exception:
            logger.exception("flycut: could not import draft upload %s", item["_id"])
        finally:
            Item().collection.update_one({"_id": item["_id"]}, {"$unset": {"flycutDraftImport": ""}})

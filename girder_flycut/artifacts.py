"""Canonical config snapshots and output file metadata."""

import copy
import io
import json

from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from girder.utility import JsonEncoder, RequestBodyStream

from .schema import unpack

# The configuration snapshot lives at the top level of the item, deliberately
# outside `meta`. girder-jsonforms binds `coerce_metadata_dates` to
# `model.item.save`, which recursively rewrites ISO-8601 strings anywhere under
# `meta` into datetimes -- and this snapshot is written verbatim into a
# generated artifact and backs the stack's IGSN, so `json.dumps` has to accept
# it unchanged. Outside `meta`, no handler touches it.
CONFIG_FIELD = "flycutConfig"

# The two `meta` forms are pre-migration layouts, kept so that a deployment
# that has not restarted yet still lists its configurations.
CONFIG_QUERY = {
    "$or": [
        {CONFIG_FIELD: {"$exists": True}},
        {"meta.config": {"$exists": True}, "meta.flycut": {"$exists": True}},
        {"meta.flycut.config": {"$exists": True}},
    ]
}


def configuration(item):
    """The configuration snapshot, wherever this item happens to carry it."""
    if CONFIG_FIELD in item:
        return item[CONFIG_FIELD]
    meta = item.get("meta", {})
    return meta.get("config", meta.get("flycut", {}).get("config", {}))


def replace_bytes(file, data, user):
    model = Upload()
    upload = model.createUploadToFile(file, user, len(data))
    return model.handleChunk(upload, RequestBodyStream(io.BytesIO(data), len(data)))


def association(config):
    run = unpack(config).get("run_params", {})
    stack, foil = run.get("stackid"), run.get("foil_material")
    return {"foilIgsn": foil or None, "igsn": f"{foil}-{stack}" if foil and stack else None, "stackid": stack or None}


def annotate(item, identifiers, extra=None):
    meta = item.setdefault("meta", {})
    for key in ("stackIgsn", "stackigsn", "stackId", "stackDepositionId", "config"):
        meta.pop(key, None)
    meta.update(identifiers)
    meta.update(extra or {})
    snapshots = copy.deepcopy(extra or {})
    item = Item().save(item)
    if snapshots:
        # Restored after the save, not through it: girder-jsonforms rewrites
        # ISO-8601 strings under `meta` into dates, and this payload mirrors an
        # artifact file that has to match it byte for byte. Same invariant as
        # `register_metadata`.
        Item().collection.update_one({"_id": item["_id"]}, {"$set": {"meta." + k: v for k, v in snapshots.items()}})
    return Item().load(item["_id"], force=True)


def save_config_file(item, user, rendered=None):
    config = copy.deepcopy(configuration(item) if rendered is None else rendered)
    item[CONFIG_FIELD] = copy.deepcopy(config)
    # Clear both pre-migration homes, so an item saved here stops carrying two
    # copies that can drift apart.
    item.get("meta", {}).pop("config", None)
    item["meta"]["flycut"].pop("config", None)
    item["meta"].update(association(config))
    item = Item().save(item)
    if item["meta"]["flycut"]["status"] != "draft":
        folder = Folder().load(item["folderId"], force=True)
        for key in ("stackIgsn", "stackigsn", "stackId", "stackDepositionId"):
            folder.setdefault("meta", {}).pop(key, None)
        folder["meta"].update(association(config))
        Folder().save(folder)
    data = json.dumps(config, indent=2, allow_nan=False, cls=JsonEncoder).encode()
    file = File().findOne({"itemId": item["_id"], "mimeType": "application/json"})
    name = item["name"] + ".json"
    if file:
        replace_bytes(file, data, user)
        file = File().load(file["_id"], force=True)
        file["name"] = name
        File().save(file)
    else:
        Upload().uploadFromFile(
            io.BytesIO(data), len(data), name, parentType="item", parent=item, user=user, mimeType="application/json"
        )
    return Item().load(item["_id"], force=True)


def register_metadata(item, registered_at, user):
    """Stamp the generated metadata artifact, and return what the file holds.

    The caller stores the return value as the artifact item's metadata, and a
    test pins the two to be equal -- so the timestamp is normalised to its ISO
    string here rather than left as a datetime that `JsonEncoder` would render
    one way into the file and Mongo would store another way beside it.
    """
    file = File().findOne({"itemId": item["_id"], "name": item["name"]})
    with File().open(file) as stream:
        payload = json.load(stream)
    payload["time_registered"] = registered_at.isoformat()
    replace_bytes(file, json.dumps(payload, indent=2, allow_nan=False, cls=JsonEncoder).encode(), user)
    return payload

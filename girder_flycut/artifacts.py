"""Canonical config snapshots and output file metadata."""

import copy
import io
import json

from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from girder.utility import RequestBodyStream

from .schema import unpack

CONFIG_QUERY = {
    "$or": [
        {"meta.config": {"$exists": True}, "meta.flycut": {"$exists": True}},
        {"meta.flycut.config": {"$exists": True}},
    ]
}


def configuration(item):
    return item.get("meta", {}).get("config", item["meta"]["flycut"].get("config", {}))


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
        Item().collection.update_one({"_id": item["_id"]}, {"$set": {"meta." + k: v for k, v in snapshots.items()}})
    return Item().load(item["_id"], force=True)


def save_config_file(item, user, rendered=None):
    config = copy.deepcopy(configuration(item) if rendered is None else rendered)
    item["meta"]["config"] = copy.deepcopy(config)
    item["meta"]["flycut"].pop("config", None)
    item["meta"].update(association(config))
    item = Item().save(item)
    # JSONForms coerces dates on save; the config snapshot must retain exact JSON types.
    Item().collection.update_one({"_id": item["_id"]}, {"$set": {"meta.config": config}})
    if item["meta"]["flycut"]["status"] != "draft":
        folder = Folder().load(item["folderId"], force=True)
        for key in ("stackIgsn", "stackigsn", "stackId", "stackDepositionId"):
            folder.setdefault("meta", {}).pop(key, None)
        folder["meta"].update(association(config))
        Folder().save(folder)
    data = json.dumps(config, indent=2, allow_nan=False).encode()
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


def register_metadata(item, now, user):
    file = File().findOne({"itemId": item["_id"], "name": item["name"]})
    with File().open(file) as stream:
        payload = json.load(stream)
    payload["time_registered"] = now
    replace_bytes(file, json.dumps(payload, indent=2, allow_nan=False).encode(), user)
    return payload

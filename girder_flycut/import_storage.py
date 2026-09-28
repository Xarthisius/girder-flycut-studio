"""Workspace Excel inputs and their stack associations."""

import io
from pathlib import Path

from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload

from . import settings


def store_workbook(data, filename, user):
    root = settings.workspace(user, write=True)
    folder = Folder().findOne({"parentId": root["_id"], "parentCollection": "folder", "name": "Excel Imports"})
    if folder:
        Folder().requireAccess(folder, user, AccessType.WRITE)
        if folder.get("meta", {}).get("flycutImports") != str(root["_id"]):
            raise RestException("Excel Imports already exists but is not a Flyer Studio inputs folder.", code=409)
    else:
        folder = Folder().createFolder(root, "Excel Imports", creator=user)
        folder = settings.apply_access(Folder(), folder, settings.policy(), user)
        Folder().setMetadata(folder, {"flycutImports": str(root["_id"])})
    name = Path(str(filename)).name
    file = Upload().uploadFromFile(
        io.BytesIO(data),
        len(data),
        name,
        parentType="folder",
        parent=folder,
        user=user,
        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    return {"name": name, "fileId": str(file["_id"]), "itemId": str(file["itemId"])}


def load_input(config, user, write=False):
    reference = config.get("parameter_import_file")
    if not isinstance(reference, dict):
        return None
    file = File().load(
        reference.get("fileId"), user=user, level=AccessType.WRITE if write else AccessType.READ, exc=True
    )
    item = Item().load(file["itemId"], force=True)
    folder = Folder().load(item["folderId"], force=True)
    workspace_id = settings.policy()["workspace_folder_id"]
    if (
        not folder
        or folder.get("parentCollection") != "folder"
        or str(folder.get("parentId")) != workspace_id
        or folder.get("meta", {}).get("flycutImports") != workspace_id
    ):
        raise RestException("Excel input is not in this Flyer Studio workspace.", code=400)
    return item


def link_input(item, identifiers):
    if item:
        # Normalize legacy strings and append atomically across simultaneous stacks.
        existing = {
            "$cond": [
                {"$isArray": "$meta.igsn"},
                "$meta.igsn",
                {"$cond": [{"$eq": [{"$type": "$meta.igsn"}, "string"]}, ["$meta.igsn"], []]},
            ]
        }
        Item().collection.update_one(
            {"_id": item["_id"]},
            [{"$set": {"meta": {"igsn": {"$setUnion": [existing, {"$literal": [identifiers["igsn"]]}]}}}}],
        )

"""A stable stack folder, with editable drafts staged separately."""

from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.folder import Folder
from girder.models.item import Item


def draft_root(workspace, user):
    folder = Folder().findOne({"parentId": workspace["_id"], "parentCollection": "folder", "name": "Drafts"})
    if folder:
        if folder.get("meta", {}).get("flycutDraftsWorkspace") != str(workspace["_id"]):
            raise RestException(
                "The workspace already has an unrelated Drafts folder. Rename it before saving drafts.", code=409
            )
        Folder().requireAccess(folder, user, AccessType.WRITE)
        return folder
    folder = Folder().createFolder(
        workspace, "Drafts", creator=user, public=workspace.get("public", False), reuseExisting=True
    )
    Folder().setAccessList(folder, workspace.get("access", {}), user=user, save=False)
    folder.setdefault("meta", {})["flycutDraftsWorkspace"] = str(workspace["_id"])
    return Folder().save(folder)


def promote(item, workspace, stack_id, user):
    folder = Folder().load(item["folderId"], user=user, level=AccessType.WRITE, exc=True)
    name = "stack" + stack_id
    collision = Folder().findOne(
        {"parentId": workspace["_id"], "parentCollection": "folder", "name": name, "_id": {"$ne": folder["_id"]}}
    )
    if collision:
        raise RestException(
            f"The workspace already contains a folder named {name}. Resolve that conflict before submitting.", code=409
        )
    if folder["_id"] == workspace["_id"]:
        raise RestException("Move this legacy configuration into its own folder before submitting.", code=409)
    if folder["parentId"] != workspace["_id"]:
        folder = Folder().move(folder, workspace, "folder")
    folder["name"] = name
    Folder().save(folder)


def remove_config(item, workspace_id):
    folder = Folder().load(item["folderId"], force=True)
    Item().remove(item)
    if (
        folder
        and str(folder["_id"]) != workspace_id
        and not folder.get("meta", {}).get("flycutDraftsWorkspace")
        and not Item().findOne({"folderId": folder["_id"]})
        and not Folder().findOne({"parentId": folder["_id"], "parentCollection": "folder"})
    ):
        Folder().remove(folder)

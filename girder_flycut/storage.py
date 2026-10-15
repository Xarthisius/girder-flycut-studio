"""A stable stack folder, with editable drafts staged separately."""

from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.folder import Folder
from girder.models.item import Item


def _drafts_query(workspace):
    return {"parentId": workspace["_id"], "parentCollection": "folder", "name": "Drafts"}


def existing_draft_root(workspace):
    """The workspace's own Drafts folder, or None -- without creating or refusing anything.

    `draft_root` is the save path's answer: it creates the folder, and it
    raises a 409 for a workspace whose `Drafts` folder it does not own. The
    import path cannot use it. That path runs on every listing request, where
    a write is a side effect nobody asked for and the 409 escapes
    `GET /flycut/config` and takes the whole dashboard with it. Here an
    unrelated folder simply means there is nothing to import.
    """
    folder = Folder().findOne(_drafts_query(workspace))
    if folder and folder.get("meta", {}).get("flycutDraftsWorkspace") == str(workspace["_id"]):
        return folder
    return None


def draft_root(workspace, user):
    folder = Folder().findOne(_drafts_query(workspace))
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

"""The four administrative policy routes."""

import re

from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.collection import Collection
from girder.models.folder import Folder
from girder.models.group import Group
from girder.models.user import User
from girder.utility.path import getResourcePath
from girder_dashboards.models.dashboard import Dashboard

from .. import KEY
from .. import settings as studio_settings


class SettingsRoutes:
    """Routes behind `@access.admin`; the browser harness is their only cover."""

    @access.admin
    @autoDescribeRoute(Description("Flyer Studio administrative policy."))
    def get_settings(self):
        result = studio_settings.policy()
        if result["workspace_folder_id"]:
            result = studio_settings.validate_settings(result)
        for role in ("creators", "owners", "editors", "viewers"):
            for ref in result[role]:
                entity = (User() if ref["type"] == "user" else Group()).load(ref["id"], force=True)
                ref["label"] = (entity.get("login") or entity.get("name")) if entity else ref["id"]
        return {
            "workspaceCollectionId": str(Folder().load(result["workspace_folder_id"], force=True)["baseParentId"])
            if result["workspace_folder_id"]
            else None,
            "settings": result,
            "collections": [{"id": str(c["_id"]), "name": c["name"]} for c in Collection().find()],
        }

    @access.admin
    @autoDescribeRoute(
        Description("Save Flyer Studio policy for new data.").jsonParam("settings", "Settings", requireObject=True)
    )
    def save_settings(self, settings):
        result = studio_settings.validate_settings(settings)
        doc = Dashboard().findOne({"key": KEY})
        doc["settings"] = result
        Dashboard().save(doc)
        return self.get_settings()

    @access.admin
    @autoDescribeRoute(Description("Find users and groups for dashboard policy.").param("q", "Name search", default=""))
    def settings_principals(self, q):
        pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
        users = User().find({"$or": [{"login": pattern}, {"firstName": pattern}, {"lastName": pattern}]}, limit=100)
        groups = Group().find({"name": pattern}, limit=100)
        return [
            {
                "type": "user",
                "id": str(u["_id"]),
                "label": u["login"] + " — " + u.get("firstName", "") + " " + u.get("lastName", ""),
            }
            for u in users
        ] + [{"type": "group", "id": str(g["_id"]), "label": g["name"]} for g in groups]

    @access.admin
    @autoDescribeRoute(Description("Resolve a collection folder.").param("id", "Folder ID"))
    def settings_workspace(self, id):
        folder = Folder().load(id, user=self.getCurrentUser(), level=AccessType.ADMIN, exc=True)
        if folder.get("baseParentType") != "collection":
            raise RestException("Choose a folder inside a collection.")
        return {"id": str(folder["_id"]), "path": getResourcePath("folder", folder, force=True)}

    def workspace(self, user, create=False):
        return studio_settings.workspace(user, write=create)

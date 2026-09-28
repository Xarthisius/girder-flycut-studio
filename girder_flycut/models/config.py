"""A Flyer Studio configuration and the rules that decide what it is."""

from datetime import timezone

from bson import ObjectId
from girder.constants import AccessType
from girder.exceptions import RestException, ValidationException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item

from .. import settings as studio_settings
from ..artifacts import configuration

STATUSES = ("draft", "submitted", "generated", "registered")


class FlycutConfig(Item):
    """An ``Item`` carrying a ``meta.flycut`` blob, inside the workspace.

    Subclassing ``Item`` rather than standing beside it keeps the ACL
    semantics that already applied: an item inherits its folder's permissions,
    so nothing here re-implements access control.
    """

    def initialize(self):
        super().initialize()
        # `name` stays "item" -- configurations live in the item collection,
        # so this model shares its documents and indices with Item().

    def validate(self, doc):
        """Validate the item, then the ``meta.flycut`` blob it carries.

        **Most writes do not reach this.** Configuration state is changed
        almost everywhere by partial ``update_one`` calls with ``$set`` and
        ``$unset`` on nested ``meta.flycut`` fields, which go straight to Mongo
        and never touch the model. What this does cover is the creation path
        and the config-file save, which both go through ``setMetadata`` /
        ``save``. Routing the partial updates through the model is a separate
        change from E4: several of them are deliberate atomic field flips (the
        ``busy`` guard is one) whose concurrency semantics a whole-document
        save would not preserve.
        """
        doc = super().validate(doc)
        state = doc.get("meta", {}).get("flycut")
        if state is None:
            return doc
        if not isinstance(state, dict):
            raise ValidationException("meta.flycut must be a JSON object.", "meta.flycut")
        status = state.get("status")
        if status is not None and status not in STATUSES:
            raise ValidationException(
                f"Unknown lifecycle status '{status}'; expected one of {', '.join(STATUSES)}.",
                "meta.flycut.status",
            )
        files = state.get("files", [])
        if not isinstance(files, list) or any(not isinstance(f, dict) or "_id" not in f for f in files):
            raise ValidationException(
                "meta.flycut.files must be a list of objects each carrying an _id.", "meta.flycut.files"
            )
        return doc

    def load(self, id, level=AccessType.WRITE, user=None, objectId=True, force=False, fields=None, exc=True):
        """Load a configuration, refusing anything outside this workspace.

        The defaults differ from ``Item.load`` deliberately -- WRITE rather
        than READ, raising rather than returning None -- because this replaces
        the old ``Flycut.config_item``, which every caller used that way.
        """
        doc = super().load(id, level=level, user=user, objectId=objectId, force=force, fields=fields, exc=exc)
        if doc is None:
            return None
        if "flycut" not in doc.get("meta", {}) or not self.inWorkspace(doc):
            raise RestException("Not a configuration in this Flyer Studio workspace.", code=403)
        return doc

    def inWorkspace(self, item):
        """Whether ``item`` sits in the configured workspace, or a draft under it."""
        workspace_id = studio_settings.policy()["workspace_folder_id"]
        folder = Folder().load(item["folderId"], force=True)
        if not workspace_id or not folder:
            return False
        if str(folder["_id"]) == workspace_id:
            return True
        if (
            item.get("meta", {}).get("flycut", {}).get("workspaceId") != workspace_id
            or folder.get("parentCollection") != "folder"
        ):
            return False
        if str(folder["parentId"]) == workspace_id:
            return True
        parent = Folder().load(folder["parentId"], force=True)
        return bool(
            parent
            and str(parent.get("parentId")) == workspace_id
            and parent.get("meta", {}).get("flycutDraftsWorkspace") == workspace_id
        )

    def lifecycle(self, item):
        """Where ``item`` sits in draft -> submitted -> generated -> registered.

        **Derived, not stored.** A configuration is `generated` because its
        file ids still resolve and `registered` because it has a registration,
        which is what makes deleting the generated files return it to
        `submitted`. Several tests and the browser harness depend on that.
        """
        state = item["meta"]["flycut"]
        if state.get("registration") or state.get("status") == "registered":
            return "registered"
        if state.get("status") == "draft":
            return "draft"
        if any(File().findOne({"_id": ObjectId(file["_id"])}) for file in state.get("files", [])):
            return "generated"
        return "submitted"

    def filter(self, doc, user=None, additionalKeys=None):
        """The shape every client screen reads.

        Not ``Model.filter``'s field-exposure filtering: this is the
        configuration as the dashboard consumes it, which is what the old
        ``Flycut.serialize`` returned.
        """
        timestamp = doc.get("updated", doc.get("created"))
        return {
            "_id": str(doc["_id"]),
            "name": doc["name"],
            "savedAt": timestamp.replace(tzinfo=timezone.utc).isoformat() if timestamp else "",
            **doc["meta"]["flycut"],
            "config": configuration(doc),
            "status": self.lifecycle(doc),
            "canEdit": Item().hasAccess(doc, user, AccessType.WRITE),
        }

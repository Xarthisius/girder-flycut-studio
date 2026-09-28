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


class WorkspaceScope:
    """The folders a configuration may sit in, resolved once instead of per item.

    Three layouts count as inside, and they are the three a configuration is
    ever written into: loose in the workspace itself (the pre-1.0 layout), in
    its own stack folder directly below it (what submitting produces), and in a
    draft folder below the workspace's Drafts root. The last two also require
    the configuration to name this workspace itself, which is the check that
    stops a folder tree moved in from elsewhere from being readable here.
    """

    def __init__(self, workspaceId, exists=False, top=(), nested=(), folders=()):
        self.workspaceId = workspaceId
        self.exists = exists
        self.top = set(top)
        self.nested = set(nested)
        # The folder documents behind those ids, kept because an item's ACL
        # *is* its folder's -- see `hasAccess`.
        self.folders = {folder["_id"]: folder for folder in folders}

    def __bool__(self):
        """False when no workspace is configured, so a listing can return early."""
        return bool(self.workspaceId)

    @property
    def folderIds(self):
        """Every folder id an in-workspace configuration can name."""
        ids = self.top | self.nested
        if self.exists:
            ids.add(ObjectId(self.workspaceId))
        return ids

    def query(self, base):
        """`base`, narrowed to this workspace so Mongo does the filtering.

        A necessary condition rather than the whole rule -- `contains` still
        decides -- but it keeps configurations belonging to another instance of
        this plugin from being read out of Mongo only to be discarded.

        With no workspace configured there is nothing to narrow to, and `base`
        is handed back unchanged. `contains` refuses everything in that state
        regardless; the callers that still walk the whole result then have
        always done so, and this is not the place to change what they see.
        """
        if not self.workspaceId:
            return base
        return {**base, "folderId": {"$in": list(self.folderIds)}}

    def hasAccess(self, item, user, level):
        """``Item().hasAccess``, answered from the folders already resolved.

        An item's ACL is its folder's: ``Item.hasAccess`` loads the item's
        folder and defers to ``Folder.hasAccess``. Every folder a contained
        item can name is already in hand, so this is that same call without
        the per-item ``Folder().load`` -- which is where the remaining N in a
        listing sat, once the policy stopped being re-read.

        Only meaningful for an item this scope ``contains``; anything else has
        no folder here and is refused.
        """
        folder = self.folders.get(item["folderId"])
        return bool(folder) and Folder().hasAccess(folder, user=user, level=level)

    def contains(self, item):
        folderId = item["folderId"]
        if self.exists and str(folderId) == self.workspaceId:
            return True
        if item.get("meta", {}).get("flycut", {}).get("workspaceId") != self.workspaceId:
            return False
        return folderId in self.top or folderId in self.nested


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

    def workspaceScope(self, policy=None):
        """Resolve the containment rule once, for a whole request.

        `inWorkspace` answers a question about a small fixed set of folders --
        the workspace, the folders directly under it, and the folders under
        those of them that are a Drafts root -- so resolving that set once and
        testing membership is the same rule at a constant number of queries.
        Two, at most: one for the workspace and its children together, and one
        for the drafts' children if any Drafts root exists.

        Pass ``policy`` where the caller already has it; the three listing
        endpoints do, and reading it again is a `Dashboard.findOne` plus a
        deepcopy.
        """
        identifier = (policy if policy is not None else studio_settings.policy())["workspace_folder_id"]
        if not identifier or not ObjectId.is_valid(identifier):
            return WorkspaceScope("")
        root = ObjectId(identifier)
        # One query for both the workspace itself -- whose existence is what
        # `Folder().load` used to establish -- and every folder directly below
        # it, which is where submitted configurations live.
        found = list(Folder().find({"$or": [{"_id": root}, {"parentId": root}]}))
        scope = WorkspaceScope(
            identifier,
            exists=any(folder["_id"] == root for folder in found),
            top={
                folder["_id"]
                for folder in found
                if folder["_id"] != root and folder.get("parentCollection") == "folder"
            },
            folders=found,
        )
        # A Drafts folder is ours because it says so, not because of its name.
        roots = [
            folder["_id"]
            for folder in found
            if folder["_id"] != root and folder.get("meta", {}).get("flycutDraftsWorkspace") == identifier
        ]
        if roots:
            drafts = list(Folder().find({"parentId": {"$in": roots}, "parentCollection": "folder"}))
            scope.nested = {folder["_id"] for folder in drafts}
            scope.folders.update({folder["_id"]: folder for folder in drafts})
        return scope

    def inWorkspace(self, item, scope=None):
        """Whether ``item`` sits in the configured workspace, or a draft under it.

        Anything iterating configurations should resolve a
        :py:meth:`workspaceScope` once and pass it: this is the containment
        rule, so it runs for every item a listing considers.
        """
        return (scope if scope is not None else self.workspaceScope()).contains(item)

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

    def filter(self, doc, user=None, additionalKeys=None, scope=None):
        """The shape every client screen reads.

        Not ``Model.filter``'s field-exposure filtering: this is the
        configuration as the dashboard consumes it, which is what the old
        ``Flycut.serialize`` returned.

        ``scope`` is the resolved :py:class:`WorkspaceScope` where the caller
        has one: ``canEdit`` is an item ACL check, which costs a folder load
        per configuration otherwise.
        """
        timestamp = doc.get("updated", doc.get("created"))
        return {
            "_id": str(doc["_id"]),
            "name": doc["name"],
            # A datetime, like `meta.flycut.savedAt` which overrides it below.
            # Girder's REST encoder renders either as ISO-8601, so the client
            # sees no difference; keeping the types the same means the server
            # can sort on it.
            "savedAt": timestamp.replace(tzinfo=timezone.utc) if timestamp else None,
            **doc["meta"]["flycut"],
            "config": configuration(doc),
            "status": self.lifecycle(doc),
            "canEdit": (
                scope.hasAccess(doc, user, AccessType.WRITE)
                if scope is not None
                else Item().hasAccess(doc, user, AccessType.WRITE)
            ),
        }

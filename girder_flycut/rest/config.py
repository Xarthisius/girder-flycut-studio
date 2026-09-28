"""Listing, stack-ID arbitration, and saving a configuration."""

import copy
import json
from datetime import datetime, timezone

from bson import ObjectId
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.folder import Folder
from girder.models.item import Item
from girder.utility import JsonEncoder

from .. import settings as studio_settings
from ..artifacts import CONFIG_QUERY, save_config_file
from ..import_storage import load_input
from ..materials import foil_materials, resolve_material
from ..models import FlycutConfig
from ..registration import is_test_run
from ..schema import pack, stack_id, unpack
from ..storage import draft_root, promote, remove_config
from ..validation import builder_warnings, normalize_builder_config
from .catalog import CATALOG
from .gate import gated
from .locking import stack_locked

# Sorting has to survive a deployment mid-migration, where some records still
# carry the pre-migration ISO string. Both forms compare correctly against
# their own kind; this puts them on one scale.
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

# Which lifecycle stage wins when one stack ID has several configurations.
# Read once per item in `stack_states`, so it does not belong inside the loop.
STACK_RANK = {"submitted": 1, "restricted": 2, "generated": 3, "registered": 4}


def _saved_at(record):
    value = record.get("savedAt")
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(value) if value else EPOCH
    except (TypeError, ValueError):
        return EPOCH


class ConfigRoutes:
    """What a configuration is, which ones you may see, and how one is saved."""

    def stack_matches(self, stack):
        return [
            item
            for item in Item().find({**CONFIG_QUERY, "meta.flycut.status": {"$ne": "draft"}})
            if FlycutConfig().stackId(item) == str(stack).strip().upper()
        ]

    @access.user
    @autoDescribeRoute(Description("Stack reuse rules for the current user."))
    @gated
    def stack_states(self, user):
        scope = FlycutConfig().workspaceScope()
        result = {}
        for item in Item().find(scope.query({**CONFIG_QUERY, "meta.flycut.status": {"$ne": "draft"}})):
            stack = FlycutConfig().stackId(item)
            status = FlycutConfig().lifecycle(item)
            if (
                not FlycutConfig().inWorkspace(item, scope) or not scope.hasAccess(item, user, AccessType.WRITE)
            ) and status == "submitted":
                status = "restricted"
            if STACK_RANK[status] > STACK_RANK.get(result.get(stack), 0):
                result[stack] = status
        return result

    @access.user
    @autoDescribeRoute(Description("Configuration catalog and signed-in operator."))
    @gated
    def options(self, user):
        return {
            "workspaceFolderId": studio_settings.policy()["workspace_folder_id"],
            "materials": foil_materials(user),
            "templates": CATALOG["templates"],
            "presets": [],
            "cache": {"operators": [user["login"]], "field_names": CATALOG["field_names"]},
        }

    @access.user
    @autoDescribeRoute(Description("List your latest 100 configurations."))
    @gated
    def configs(self, user):
        scope = FlycutConfig().workspaceScope()
        if not scope:
            return []
        records = [
            FlycutConfig().filter(i, user, scope=scope)
            for i in Item().find(scope.query(CONFIG_QUERY))
            if scope.contains(i) and scope.hasAccess(i, user, AccessType.READ)
        ]
        return sorted(records, key=_saved_at, reverse=True)[:100]

    @access.user
    @autoDescribeRoute(Description("Stack IDs with one of your submitted configurations."))
    @gated
    def submitted_stacks(self, user):
        return self.submitted_stack_ids(user)

    @access.user
    @autoDescribeRoute(Description("Lowest unused five-character Crockford stack ID."))
    @gated
    def next_stack_id(self):
        used = {FlycutConfig().stackId(item) for item in Item().find(CONFIG_QUERY)}
        alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
        for number in range(len(used) + 1):
            value = number
            candidate = ""
            for _ in range(5):
                candidate = alphabet[value % 32] + candidate
                value //= 32
            if value:
                break
            if candidate not in used:
                return {"stackid": candidate}
        raise RestException("No available Stack IDs remain.")

    def submitted_stack_ids(self, user):
        scope = FlycutConfig().workspaceScope()
        records = Item().find(scope.query({**CONFIG_QUERY, "meta.flycut.status": {"$ne": "draft"}}))
        return sorted(
            {
                FlycutConfig().stackId(item)
                for item in records
                if scope.contains(item) and scope.hasAccess(item, user, AccessType.READ)
            }
            - {""}
        )

    def _snapshot(self, config):
        """The configuration as stored: the packed form, without the operator's identity.

        `createdBy` and `preset` are server-owned, so whatever the client sent
        for them is dropped rather than trusted.
        """
        rendered = copy.deepcopy(config) if "run_parameters" in config else pack(config)
        rendered.pop("createdBy", None)
        rendered["preset"] = None
        return rendered

    def _resolved(self, config, user, validated):
        """A submission with its references resolved and its rules applied.

        Raises `ValueError` rather than `RestException`, because the caller
        turns any of these into one 400 and the normalisers below raise the
        same way.
        """
        config = unpack(config)
        config["preset"] = None
        is_test_run(config)
        load_input(config, user)
        if isinstance(config.get("run_params"), dict):
            config["run_params"]["foil_material"] = resolve_material(config["run_params"].get("foil_material"), user)[
                "id"
            ]
        catalog = self.catalog_for(config, user)
        warnings = builder_warnings(config, catalog)
        if stack_id(config) in self.submitted_stack_ids(user):
            warnings.append("This Stack ID already has a submitted configuration.")
        config = normalize_builder_config(config, user, catalog)
        if warnings and not validated:
            raise ValueError("Confirm validation warnings before submitting.")
        return config

    def _name(self, given, stack, submit):
        """What a configuration is called.

        A submitted one is named for its stack whatever the operator typed --
        that is what makes `stack{id}-config` the name the workspace can be
        read by. A draft keeps what was typed, and falls back to its stack or
        to a placeholder.
        """
        given = given.strip()
        if len(given) > 160:
            raise RestException("Configuration name must be at most 160 characters.")
        if submit or (not given and stack):
            return f"stack{stack}-config"
        return given or "Untitled draft"

    def _state(self, existing, workspace_id, user, config, submit):
        """The `meta.flycut` blob this save writes, before any collision is resolved."""
        now = datetime.now(timezone.utc)
        state = {
            "status": "submitted" if submit else "draft",
            "overwriteSafe": existing["meta"]["flycut"].get("overwriteSafe", True) if existing else True,
            "createdBy": str(user["_id"]),
            "savedAt": now,
            "workspaceId": workspace_id,
        }
        if submit:
            state["submittedAt"] = now
        else:
            # Only a draft carries the builder's row layout; submitting renders it.
            state["customFieldRows"] = config.get("custom_field_rows", [])
        return state

    def _refuse_stack_collision(self, matches, user, scope):
        """Why this stack ID may not be taken, in the order the client expects to hear it."""
        for match in matches:
            lifecycle = FlycutConfig().lifecycle(match)
            if lifecycle == "registered":
                raise RestException("This Stack ID is registered and cannot be reused.", code=409)
            if lifecycle == "generated":
                raise RestException("Delete the generated files before reusing this Stack ID.", code=409)
            if not FlycutConfig().inWorkspace(match, scope) or not Item().hasAccess(match, user, AccessType.WRITE):
                raise RestException("This Stack ID belongs to another user.", code=409)

    def _replace_submitted(self, matches, existing, name, state, rendered, stack, user, workspace_id):
        """Take over the submitted configuration that already holds this stack ID.

        Any further configurations for the same stack, and the draft this was
        submitted from, are removed: one stack, one configuration.
        """
        state["overwriteSafe"] = False
        target = matches[0]
        promote(target, self.workspace(user, True), stack, user)
        FlycutConfig().replace(target, name, state, rendered)
        for duplicate in matches[1:]:
            remove_config(duplicate, workspace_id)
        if existing and existing["_id"] != target["_id"]:
            remove_config(existing, workspace_id)
        return Item().load(target["_id"], force=True)

    def _update_draft(self, existing, name, state, rendered, stack, submit, user):
        """Write over the operator's own draft, which another request may be submitting."""
        if submit:
            promote(existing, self.workspace(user, True), stack, user)
        item = FlycutConfig().replace(existing, name, state, rendered, expect="draft")
        if item is None:
            raise RestException("This draft was already submitted.", code=409)
        return item

    def _create(self, name, state, rendered, stack, submit, user, policy):
        """Bring a configuration into existence, in a folder of its own."""
        workspace = self.workspace(user, True)
        parent = workspace if submit else draft_root(workspace, user)
        folder_name = "stack" + stack if submit else "draft-" + str(ObjectId())
        if submit and Folder().findOne(
            {"parentId": workspace["_id"], "parentCollection": "folder", "name": folder_name}
        ):
            raise RestException("A folder for this stack already exists in the workspace.", code=409)
        folder = Folder().createFolder(parent, folder_name, creator=user, public=False)
        folder = studio_settings.apply_access(Folder(), folder, policy, user)
        # Through the model, not Item(), so FlycutConfig.validate() runs on the
        # one write that brings a configuration into existence.
        item = FlycutConfig().createItem(name, creator=user, folder=folder)
        item = FlycutConfig().setMetadata(item, {"flycut": state, "config": copy.deepcopy(rendered)})
        if submit and item["name"] != name:
            # Direct, because `Item.validate` is what changed the name in the
            # first place: `createItem` appends `(n)` on a collision, and a
            # submitted configuration's name has to be exactly its stack's.
            Item().collection.update_one({"_id": item["_id"]}, {"$set": {"name": name}})
            item["name"] = name
        return item

    @access.user
    @autoDescribeRoute(
        Description("Save an editable draft or submit a final configuration.")
        .jsonParam("config", "Builder configuration", requireObject=True)
        .param("name", "Saved configuration name", default="")
        .param("id", "Existing draft ID", default="")
        .param("submit", "Finalize the configuration", dataType="boolean", default=False)
        .param("validated", "Acknowledge validation warnings", dataType="boolean", default=False)
    )
    @gated
    @stack_locked
    def save_config(self, config, name="", id="", submit=False, validated=False, user=None):
        """Three persistence paths: overwrite a submitted stack, update a draft, create new.

        Which one runs is the only decision here. Everything above it prepares
        the same three values for whichever it turns out to be.
        """
        # One read of the policy for the whole call: it is a `Dashboard.findOne`
        # plus a deepcopy, and four places below want the same answer from it.
        policy = studio_settings.policy()
        workspace_id = policy["workspace_folder_id"]
        if len(json.dumps(config, allow_nan=False, cls=JsonEncoder).encode()) > 256 * 1024:
            raise RestException("Configuration exceeds 256 KB.")
        rendered = self._snapshot(config)
        existing = FlycutConfig().load(id, user=user) if id else None
        if existing and existing["meta"]["flycut"].get("status") != "draft":
            raise RestException("Submitted configurations cannot be edited. Make a copy.", code=409)
        try:
            if submit:
                config = self._resolved(config, user, validated)
            else:
                config = copy.deepcopy(config)
                config["createdBy"] = str(user["_id"])
        except (ValueError, TypeError) as exc:
            raise RestException(str(exc)) from exc

        stack = config.get("run_params", {}).get("stackid", "")
        name = self._name(name, stack, submit)
        state = self._state(existing, workspace_id, user, config, submit)

        # `stack_matches` deliberately searches the whole instance, so a collision
        # outside this workspace is still reported as someone else's stack rather
        # than silently overwritten.
        matches = self.stack_matches(stack) if submit else []
        if matches:
            self._refuse_stack_collision(matches, user, FlycutConfig().workspaceScope(policy))
            if not validated:
                raise RestException("Validate replacement of the submitted configuration.", code=409)
            item = self._replace_submitted(matches, existing, name, state, rendered, stack, user, workspace_id)
        elif existing:
            item = self._update_draft(existing, name, state, rendered, stack, submit, user)
        else:
            item = self._create(name, state, rendered, stack, submit, user, policy)
        return FlycutConfig().filter(save_config_file(item, user, rendered), user)

    @access.user
    @autoDescribeRoute(
        Description("Delete your editable draft.").modelParam(
            "id",
            "Draft ID",
            model="flycutConfig",
            plugin="flycut",
            level=AccessType.WRITE,
            paramType="path",
            destName="item",
        )
    )
    @gated
    def delete_draft(self, item, user):
        # Claim only a draft, so a concurrent submission cannot be deleted.
        if not FlycutConfig().claimStatus(item, expect="draft", become="deleting"):
            raise RestException("Only editable drafts can be deleted.", code=409)
        try:
            remove_config(item, studio_settings.policy()["workspace_folder_id"])
        except Exception:
            FlycutConfig().claimStatus(item, expect="deleting", become="draft")
            raise
        return {"deleted": str(item["_id"])}

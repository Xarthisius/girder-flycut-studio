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
from ..artifacts import CONFIG_FIELD, CONFIG_QUERY, configuration, save_config_file
from ..import_storage import load_input
from ..materials import foil_materials, resolve_material
from ..models import FlycutConfig
from ..registration import is_test_run
from ..schema import pack, unpack
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
            if str(unpack(configuration(item)).get("run_params", {}).get("stackid", "")).strip().upper()
            == stack.strip().upper()
        ]

    @access.user
    @autoDescribeRoute(Description("Stack reuse rules for the current user."))
    @gated
    def stack_states(self, user):
        scope = FlycutConfig().workspaceScope()
        result = {}
        for item in Item().find(scope.query({**CONFIG_QUERY, "meta.flycut.status": {"$ne": "draft"}})):
            stack = str(unpack(configuration(item)).get("run_params", {}).get("stackid", "")).strip().upper()
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
        used = {
            str(unpack(configuration(item)).get("run_params", {}).get("stackid", "")).strip().upper()
            for item in Item().find(CONFIG_QUERY)
        }
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
                str(unpack(configuration(item)).get("run_params", {}).get("stackid", "")).strip()
                for item in records
                if scope.contains(item) and scope.hasAccess(item, user, AccessType.READ)
            }
            - {""}
        )

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
        # One read of the policy for the whole call: it is a `Dashboard.findOne`
        # plus a deepcopy, and five places below want the same answer from it.
        policy = studio_settings.policy()
        workspace_id = policy["workspace_folder_id"]
        if len(json.dumps(config, allow_nan=False, cls=JsonEncoder).encode()) > 256 * 1024:
            raise RestException("Configuration exceeds 256 KB.")
        rendered_config = copy.deepcopy(config) if "run_parameters" in config else pack(config)
        rendered_config.pop("createdBy", None)
        rendered_config["preset"] = None
        existing = FlycutConfig().load(id, user=user) if id else None
        if existing and existing["meta"]["flycut"].get("status") != "draft":
            raise RestException("Submitted configurations cannot be edited. Make a copy.", code=409)
        try:
            if submit:
                config = unpack(config)
                config["preset"] = None
                is_test_run(config)
                load_input(config, user)
                if isinstance(config.get("run_params"), dict):
                    config["run_params"]["foil_material"] = resolve_material(
                        config["run_params"].get("foil_material"), user
                    )["id"]
                catalog = self.catalog_for(config, user)
                warnings = builder_warnings(config, catalog)
                if str(config.get("run_params", {}).get("stackid", "")).strip() in self.submitted_stack_ids(user):
                    warnings.append("This Stack ID already has a submitted configuration.")
                config = normalize_builder_config(config, user, catalog)
                if warnings and not validated:
                    raise ValueError("Confirm validation warnings before submitting.")
            else:
                config = copy.deepcopy(config)
                config["createdBy"] = str(user["_id"])
        except (ValueError, TypeError) as exc:
            raise RestException(str(exc)) from exc
        name = name.strip()
        if len(name) > 160:
            raise RestException("Configuration name must be at most 160 characters.")
        stack = config.get("run_params", {}).get("stackid", "")
        name = f"stack{stack}-config" if submit else name or (f"stack{stack}-config" if stack else "Untitled draft")
        state = {
            "status": "submitted" if submit else "draft",
            "overwriteSafe": existing["meta"]["flycut"].get("overwriteSafe", True) if existing else True,
            "createdBy": str(user["_id"]),
            "savedAt": datetime.now(timezone.utc),
            "workspaceId": workspace_id,
        }
        if not submit:
            state["customFieldRows"] = config.get("custom_field_rows", [])
        if submit:
            state["submittedAt"] = state["savedAt"]
            matches = self.stack_matches(stack)
            # `stack_matches` deliberately searches the whole instance, so a
            # collision outside this workspace is still reported as someone
            # else's stack rather than silently overwritten.
            scope = FlycutConfig().workspaceScope(policy)
            for match in matches:
                lifecycle = FlycutConfig().lifecycle(match)
                if lifecycle == "registered":
                    raise RestException("This Stack ID is registered and cannot be reused.", code=409)
                if lifecycle == "generated":
                    raise RestException("Delete the generated files before reusing this Stack ID.", code=409)
                if not FlycutConfig().inWorkspace(match, scope) or not Item().hasAccess(match, user, AccessType.WRITE):
                    raise RestException("This Stack ID belongs to another user.", code=409)
            if matches:
                if not validated:
                    raise RestException("Validate replacement of the submitted configuration.", code=409)
                state["overwriteSafe"] = False
                target = matches[0]
                promote(target, self.workspace(user, True), stack, user)
                Item().collection.update_one(
                    {"_id": target["_id"]},
                    {
                        "$set": {"name": name, "meta.flycut": state, CONFIG_FIELD: rendered_config},
                        # `meta.flycut` is replaced wholesale just above, which
                        # already drops the legacy `meta.flycut.config`; naming
                        # both a parent and its child in one update conflicts.
                        "$unset": {"meta.config": ""},
                    },
                )
                for duplicate in matches[1:]:
                    remove_config(duplicate, workspace_id)
                if existing and existing["_id"] != target["_id"]:
                    remove_config(existing, workspace_id)
                return FlycutConfig().filter(
                    save_config_file(Item().load(target["_id"], force=True), user, rendered_config), user
                )
        if existing:
            if submit:
                promote(existing, self.workspace(user, True), stack, user)
            result = Item().collection.update_one(
                {"_id": existing["_id"], "meta.flycut.status": "draft"},
                {
                    "$set": {"name": name, "meta.flycut": state, CONFIG_FIELD: rendered_config},
                    "$unset": {"meta.config": ""},
                },
            )
            if not result.modified_count and not result.matched_count:
                raise RestException("This draft was already submitted.", code=409)
            item = Item().load(existing["_id"], force=True)
        else:
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
            item = FlycutConfig().setMetadata(item, {"flycut": state, "config": copy.deepcopy(rendered_config)})
            if submit and item["name"] != name:
                Item().collection.update_one({"_id": item["_id"]}, {"$set": {"name": name}})
                item["name"] = name
        return FlycutConfig().filter(save_config_file(item, user, rendered_config), user)

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
        result = Item().collection.update_one(
            {"_id": item["_id"], "meta.flycut.status": "draft"}, {"$set": {"meta.flycut.status": "deleting"}}
        )
        if not result.modified_count:
            raise RestException("Only editable drafts can be deleted.", code=409)
        try:
            remove_config(item, studio_settings.policy()["workspace_folder_id"])
        except Exception:
            Item().collection.update_one(
                {"_id": item["_id"], "meta.flycut.status": "deleting"}, {"$set": {"meta.flycut.status": "draft"}}
            )
            raise
        return {"deleted": str(item["_id"])}

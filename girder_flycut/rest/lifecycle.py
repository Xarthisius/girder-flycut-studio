"""The three lifecycle transitions: generate, delete files, register.

Each is wrapped in `@stack_locked`, so two workers cannot move the same stack
at once; the mutex itself is `stack_mutex`, a Redis lock.
"""

import copy
import io
import json
from datetime import datetime, timezone

from bson import ObjectId
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from girder.utility import JsonEncoder
from girder_jsonforms.models.deposition import Deposition
from pymongo.errors import DuplicateKeyError

from .. import settings as studio_settings
from ..artifacts import annotate, association, configuration, register_metadata
from ..generate import generate
from ..import_storage import link_input, load_input
from ..inventory import register_inventory
from ..materials import resolve_material
from ..models import FlycutConfig
from ..registration import foil_identifiers, is_test_run, stack_metadata
from ..schema import unpack
from ..validation import normalize_config
from .gate import gated
from .locking import stack_locked


class LifecycleRoutes:
    """Moving a configuration between submitted, generated and registered."""

    def rendered(self, item, user):
        """The configuration as the client should now see it, read back fresh.

        Every transition here returns this: the handler holds the document it
        started from, and what it wrote went through the model, so the answer
        has to come from storage rather than from the copy in hand.
        """
        return FlycutConfig().filter(FlycutConfig().load(item["_id"], user=user), user)

    def lock(self, item, action):
        if not FlycutConfig().claimBusy(item, action):
            raise RestException("This configuration is already being processed.", code=409)

    @access.user
    @autoDescribeRoute(
        Description("Generate and store the LightBurn bundle.").modelParam(
            "id",
            "Configuration ID",
            model="flycutConfig",
            plugin="flycut",
            level=AccessType.WRITE,
            paramType="path",
            destName="item",
        )
    )
    @gated
    @stack_locked
    def generate_config(self, item, user):
        if item["meta"]["flycut"].get("status") == "draft":
            raise RestException("Submit the draft before generating files.")
        if FlycutConfig().lifecycle(item) in {"generated", "registered"}:
            return FlycutConfig().filter(item, user)
        stack = FlycutConfig().stackId(item)
        if any(
            other["_id"] != item["_id"] and FlycutConfig().lifecycle(other) in {"generated", "registered"}
            for other in self.stack_matches(stack)
        ):
            raise RestException("Another configuration for this Stack ID is generated or registered.", code=409)
        self.lock(item, "generate")
        folder = None
        files = []
        try:
            item = FlycutConfig().load(item["_id"], user=user)
            if FlycutConfig().lifecycle(item) in {"generated", "registered"}:
                return FlycutConfig().filter(item, user)
            raw_config = unpack(configuration(item))
            material = resolve_material(raw_config["run_params"]["foil_material"], user)
            raw_config["run_params"]["foil_material"] = material["id"]
            config = normalize_config(raw_config, user, self.catalog_for(raw_config, user), submitted=True)
            template = config["run_params"]["template"]
            portal = self.portal_template(template, user) if template.startswith("girder:") else None
            generated_at = datetime.now(timezone.utc)
            artifacts = generate(
                config,
                portal_template=portal,
                material_record=material,
                lifecycle={**item["meta"]["flycut"], "generatedAt": generated_at},
            )
            folder = Folder().load(item["folderId"], user=user, level=AccessType.WRITE, exc=True)
            files = []
            for name, (data, mime) in artifacts.items():
                file = Upload().uploadFromFile(
                    io.BytesIO(data), len(data), name, parentType="folder", parent=folder, user=user, mimeType=mime
                )
                output_item = Item().load(file["itemId"], force=True)
                extra = {"metadata": json.loads(data)} if name.endswith("-metadata.json") else {}
                annotate(output_item, association(configuration(item)), extra)
                files.append({"_id": str(file["_id"]), "itemId": str(file["itemId"]), "name": name})
            FlycutConfig().setState(
                item,
                outputSchemaVersion=3,
                files=files,
                folderId=str(folder["_id"]),
                status="generated",
                generatedAt=generated_at,
            )
        except Exception as exc:
            for artifact in files:
                generated_item = Item().load(artifact["itemId"], force=True)
                if generated_item:
                    Item().remove(generated_item)
            if isinstance(exc, ValueError):
                raise RestException(str(exc)) from exc
            raise
        finally:
            FlycutConfig().setState(item, busy=False)
        return self.rendered(item, user)

    @access.user
    @autoDescribeRoute(
        Description("Delete generated files and return to submitted.").modelParam(
            "id",
            "Configuration ID",
            model="flycutConfig",
            plugin="flycut",
            level=AccessType.WRITE,
            paramType="path",
            destName="item",
        )
    )
    @gated
    @stack_locked
    def delete_files(self, item, user):
        if FlycutConfig().lifecycle(item) == "registered":
            raise RestException("Registered stacks cannot have their generated files deleted here.", code=409)
        for artifact in item["meta"]["flycut"].get("files", []):
            file = File().load(ObjectId(artifact["_id"]), user=user, level=AccessType.WRITE)
            if file:
                File().remove(file)
                if not File().findOne({"itemId": file["itemId"]}):
                    artifact_item = Item().load(file["itemId"], force=True)
                    if artifact_item and artifact_item["_id"] != item["_id"]:
                        Item().remove(artifact_item)
        FlycutConfig().setState(
            item,
            status="submitted",
            overwriteSafe=False,
            unset=("files", "folderId", "generatedAt"),
        )
        return self.rendered(item, user)

    @access.user
    @autoDescribeRoute(
        Description("Register the generated stack as a child IGSN.").modelParam(
            "id",
            "Configuration ID",
            model="flycutConfig",
            plugin="flycut",
            level=AccessType.WRITE,
            paramType="path",
            destName="item",
        )
    )
    @gated
    @stack_locked
    def register_config(self, item, user):
        # The id as the client sent it: what `flycutConfigId` has always held.
        config_id = str(item["_id"])
        state = item["meta"]["flycut"]
        if FlycutConfig().lifecycle(item) != "registered" and not state.get("files"):
            raise RestException("Generate files before registering.")
        if state.get("registration"):
            return FlycutConfig().filter(item, user)
        if not all(File().findOne({"_id": ObjectId(file["_id"])}) for file in state["files"]):
            raise RestException(
                "Some generated files are missing. Delete the remaining files and regenerate.", code=409
            )
        config = unpack(configuration(item))
        try:
            test_run = is_test_run(config)
        except ValueError as exc:
            raise RestException(str(exc)) from exc
        material = resolve_material(config["run_params"]["foil_material"], user)
        model = Deposition()
        parent = model.findOne({"igsn": material["igsn"]})
        if parent is None:
            raise RestException("The parent foil IGSN is not available on this Girder instance.", code=404)
        model.requireAccess(parent, user=user, level=AccessType.WRITE)
        folder = Folder().load(state["folderId"], user=user, level=AccessType.WRITE, exc=True)
        # Check all destination permissions before creating any external identifier.
        artifact_items = [Item().load(f["itemId"], user=user, level=AccessType.WRITE, exc=True) for f in state["files"]]
        settings = studio_settings.policy()
        configured_creators = studio_settings.creators(settings, user)
        input_item = load_input(config, user, write=True)
        self.lock(item, "register")
        try:
            child_igsn = f"{parent['igsn']}-{config['run_params']['stackid']}"
            child = model.findOne({"igsn": child_igsn})
            if child and str(child.get("flycutConfigId", "")) != config_id:
                raise RestException("This stack IGSN already exists for another configuration.", code=409)
            if not child:
                # Reserve this parent/suffix across workers before contacting the registry.
                # The durable reservation intentionally survives uncertain registry failures.
                # A direct insert, because the duplicate key *is* the check: two
                # requests racing for one child IGSN must not both reserve it.
                reservations = Item().collection.database["flycut_registration"]
                try:
                    reservations.insert_one({"_id": child_igsn, "configId": config_id})
                except DuplicateKeyError as exc:
                    raise RestException(
                        "This IGSN has a previous registration attempt. "
                        "Ask an administrator to reconcile it before retrying.",
                        code=409,
                    ) from exc
                source = copy.deepcopy(parent)
                source["creatorId"] = user["_id"]
                source["track"] = False
                source["metadata"] = stack_metadata(parent["metadata"], user, config["run_params"]["stackid"], test_run)
                source["metadata"]["creators"] = configured_creators
                source["access"] = studio_settings.access_list(settings, user)
                source["public"] = settings["public_igsn"]
                source["publicFlags"] = []
                result = model.create_batch(
                    source,
                    [(config["run_params"]["stackid"], None)],
                    relation_type="IsDerivedFrom",
                    inverse_relation_type="IsSourceOf",
                    child_titles={
                        config["run_params"][
                            "stackid"
                        ]: f"Flyer Stack {config['run_params']['stackid']} ({parent['metadata']['titles'][0]['title']})"
                    },
                )
                child = model.load(result.inserted_ids[0], force=True, exc=True)
                child["flycutConfigId"] = config_id
                child = model.save(child)
            else:
                model.requireAccess(child, user=user, level=AccessType.WRITE)
            parent = model.load(parent["_id"], user=user, level=AccessType.WRITE, exc=True)
            parent["metadata"]["alternateIdentifiers"] = foil_identifiers(parent["metadata"], test_run)
            model.save(parent)
            metadata = association(configuration(item))
            link_input(input_item, metadata)
            if input_item:
                # `$addToSet` on a deposition, not a configuration: several stacks
                # can name one input file at once, and each must survive.
                model.collection.update_one(
                    {"_id": child["_id"]}, {"$addToSet": {"flycutInputs": str(input_item["_id"])}}
                )
            Folder().setMetadata(folder, metadata)
            registered_at = datetime.now(timezone.utc)
            for artifact in artifact_items:
                extra = {}
                if state.get("outputSchemaVersion", 0) >= 2 and artifact["name"].endswith("-inventory.csv"):
                    # The one place that still needs the string: csv.DictWriter
                    # would render a datetime with a space separator, not ISO.
                    register_inventory(artifact, user, registered_at.isoformat())
                if state.get("outputSchemaVersion", 0) >= 3 and artifact["name"].endswith("-metadata.json"):
                    extra["metadata"] = register_metadata(artifact, registered_at, user)
                annotate(artifact, metadata, extra)
            receipt = {
                **metadata,
                "testRun": test_run,
                "registeredAt": registered_at,
                "parentDepositionId": str(parent["_id"]),
                "folderId": str(folder["_id"]),
                "registeredBy": str(user["_id"]),
            }
            data = json.dumps(receipt, indent=2, cls=JsonEncoder).encode()
            receipt_file = Upload().uploadFromFile(
                io.BytesIO(data),
                len(data),
                f"stack{config['run_params']['stackid']}-registration.json",
                parentType="folder",
                parent=folder,
                user=user,
                mimeType="application/json",
            )
            Item().setMetadata(
                Item().load(receipt_file["itemId"], user=user, level=AccessType.WRITE, exc=True), metadata
            )
            files = state["files"] + [
                {"_id": str(receipt_file["_id"]), "itemId": str(receipt_file["itemId"]), "name": receipt_file["name"]}
            ]
            FlycutConfig().setState(
                item,
                metadata=metadata,
                registration=receipt,
                files=files,
                status="registered",
                registeredAt=registered_at,
            )
        finally:
            FlycutConfig().setState(item, busy=False)
        return self.rendered(item, user)

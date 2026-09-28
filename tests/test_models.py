"""The model layer: containment, derived lifecycle, and validation."""

import json

import pytest
from girder.exceptions import RestException, ValidationException
from girder.models.folder import Folder
from girder.models.item import Item
from pytest_girder.assertions import assertStatusOk
from test_api import enabled  # noqa: F401  -- fixture
from test_dashboard import configuration

from girder_flycut.models import FlycutConfig

# Both plugins, deliberately. Loading only flycut leaves girder-jsonforms'
# event bindings unregistered -- `coerce_metadata_dates` on `model.item.save`
# above all -- so a whole class of production behaviour is invisible here. The
# configuration snapshot depends on those hooks being present.
pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]


def _config(server, user, stack="F100"):
    payload = configuration()
    payload["run_params"]["stackid"] = stack
    response = server.request(
        "/flycut/config",
        method="POST",
        user=user,
        params={"submit": True, "validated": True, "config": json.dumps(payload)},
    )
    assertStatusOk(response)
    return Item().load(response.json["_id"], force=True)


def test_registered_with_the_model_importer(server, enabled):  # noqa: F811
    from girder.utility.model_importer import ModelImporter

    assert isinstance(ModelImporter.model("flycutConfig", "flycut"), FlycutConfig)


def test_model_shares_the_item_collection(server, enabled):  # noqa: F811
    # Configurations are Items carrying meta.flycut, so the model must not
    # quietly acquire a collection of its own.
    assert FlycutConfig().name == "item"
    assert FlycutConfig().collection.name == Item().collection.name


def test_lifecycle_is_derived_from_files_not_stored(server, enabled, user, fsAssetstore):  # noqa: F811
    item = _config(server, user)
    assert FlycutConfig().lifecycle(item) == "submitted"

    server.request(f"/flycut/config/{item['_id']}/generate", method="POST", user=user)
    item = Item().load(item["_id"], force=True)
    assert FlycutConfig().lifecycle(item) == "generated"

    # Deleting the files must walk it back -- the harness depends on this too.
    server.request(f"/flycut/config/{item['_id']}/files", method="DELETE", user=user)
    item = Item().load(item["_id"], force=True)
    assert FlycutConfig().lifecycle(item) == "submitted"


def test_in_workspace_rejects_an_item_outside_it(server, enabled, user):  # noqa: F811
    item = _config(server, user)
    assert FlycutConfig().inWorkspace(item)

    elsewhere = Folder().createFolder(user, "Loose", parentType="user", creator=user)
    Item().collection.update_one({"_id": item["_id"]}, {"$set": {"folderId": elsewhere["_id"]}})
    assert not FlycutConfig().inWorkspace(Item().load(item["_id"], force=True))


def test_load_refuses_an_item_outside_the_workspace(server, enabled, user):  # noqa: F811
    item = _config(server, user)
    assert FlycutConfig().load(item["_id"], user=user)["_id"] == item["_id"]

    elsewhere = Folder().createFolder(user, "Loose", parentType="user", creator=user)
    Item().collection.update_one({"_id": item["_id"]}, {"$set": {"folderId": elsewhere["_id"]}})
    with pytest.raises(RestException) as excinfo:
        FlycutConfig().load(item["_id"], user=user)
    assert excinfo.value.code == 403


def test_load_refuses_an_item_that_is_not_a_configuration(server, enabled, user):  # noqa: F811
    item = _config(server, user)
    folder = Item().load(item["_id"], force=True)["folderId"]
    plain = Item().createItem("not-a-config", creator=user, folder=Folder().load(folder, force=True))
    with pytest.raises(RestException) as excinfo:
        FlycutConfig().load(plain["_id"], user=user)
    assert excinfo.value.code == 403


def test_filter_reports_the_derived_status_and_edit_right(server, enabled, user):  # noqa: F811
    item = _config(server, user)
    result = FlycutConfig().filter(item, user)
    assert result["_id"] == str(item["_id"])
    assert result["status"] == "submitted"
    assert result["canEdit"] is True
    assert result["config"]["run_parameters"]["stackid"] == "F100"
    # Without a user there is no write access to report.
    assert FlycutConfig().filter(item, None)["canEdit"] is False


@pytest.mark.parametrize(
    "state,field",
    [
        ("not a dict", "meta.flycut"),
        ({"status": "halfway"}, "meta.flycut.status"),
        ({"files": "nope"}, "meta.flycut.files"),
        ({"files": [{"name": "no id"}]}, "meta.flycut.files"),
    ],
)
def test_validate_rejects_a_malformed_state_blob(server, enabled, user, state, field):  # noqa: F811
    item = _config(server, user)
    item["meta"]["flycut"] = state
    with pytest.raises(ValidationException) as excinfo:
        FlycutConfig().save(item)
    assert excinfo.value.field == field


def test_validate_accepts_an_item_with_no_flycut_state(server, enabled, user):  # noqa: F811
    folder = Folder().load(_config(server, user)["folderId"], force=True)
    plain = Item().createItem("plain", creator=user, folder=folder)
    assert FlycutConfig().save(plain)["_id"] == plain["_id"]

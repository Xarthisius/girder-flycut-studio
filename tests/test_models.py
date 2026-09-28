"""The model layer: containment, derived lifecycle, and validation."""

import json

import pytest
from girder.constants import AccessType
from girder.exceptions import RestException, ValidationException
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.user import User
from girder_dashboards.models.dashboard import Dashboard
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


# `inWorkspace` is the containment rule: it decides what a user is allowed to
# see, so every branch of it is pinned here before anything reshapes how the
# answer is computed. The three `True` cases are the three layouts a
# configuration is ever written into -- legacy (loose in the workspace),
# submitted (its own stack folder), and draft (under Drafts).


def _workspace(server):
    return Folder().load(Dashboard().findOne({"key": "flycut-config"})["settings"]["workspace_folder_id"], force=True)


def _draft(server, user):
    response = server.request(
        "/flycut/config", method="POST", user=user, params={"config": json.dumps(configuration()), "name": "d"}
    )
    assertStatusOk(response)
    return Item().load(response.json["_id"], force=True)


def _move(item, folder):
    Item().collection.update_one({"_id": item["_id"]}, {"$set": {"folderId": folder["_id"]}})
    return Item().load(item["_id"], force=True)


def test_in_workspace_accepts_an_item_loose_in_the_workspace(server, enabled, user):  # noqa: F811
    """The legacy layout: no stack folder, and no `workspaceId` required either."""
    item = _move(_config(server, user), _workspace(server))
    Item().collection.update_one({"_id": item["_id"]}, {"$unset": {"meta.flycut.workspaceId": ""}})
    assert FlycutConfig().inWorkspace(Item().load(item["_id"], force=True))


def test_in_workspace_accepts_a_submitted_stack_folder(server, enabled, user):  # noqa: F811
    """What submitting produces: the item's folder is a direct child of the workspace."""
    item = _config(server, user)
    folder = Folder().load(item["folderId"], force=True)
    assert str(folder["parentId"]) == str(_workspace(server)["_id"])
    assert FlycutConfig().inWorkspace(item)


def test_in_workspace_accepts_a_draft_under_drafts(server, enabled, user):  # noqa: F811
    """The case the review named as missing: two folders below the workspace."""
    item = _draft(server, user)
    folder = Folder().load(item["folderId"], force=True)
    drafts = Folder().load(folder["parentId"], force=True)
    assert drafts["name"] == "Drafts"
    assert str(drafts["parentId"]) == str(_workspace(server)["_id"])
    assert FlycutConfig().inWorkspace(item)


def test_in_workspace_rejects_a_grandchild_that_is_not_under_drafts(server, enabled, user):  # noqa: F811
    """`flycutDraftsWorkspace` is what makes a Drafts folder ours, not its name."""
    item = _draft(server, user)
    drafts = Folder().load(Folder().load(item["folderId"], force=True)["parentId"], force=True)
    Folder().collection.update_one({"_id": drafts["_id"]}, {"$unset": {"meta.flycutDraftsWorkspace": ""}})
    assert not FlycutConfig().inWorkspace(item)


def test_in_workspace_rejects_an_item_claiming_another_workspace(server, enabled, user):  # noqa: F811
    """Below the top level, the item's own `workspaceId` has to agree."""
    item = _config(server, user)
    Item().collection.update_one(
        {"_id": item["_id"]},
        {
            "$set": {
                "meta.flycut.workspaceId": str(
                    Folder().createFolder(user, "Other", parentType="user", creator=user)["_id"]
                )
            }
        },
    )
    assert not FlycutConfig().inWorkspace(Item().load(item["_id"], force=True))


def test_in_workspace_rejects_a_great_grandchild(server, enabled, user):  # noqa: F811
    """Containment stops two folders below the workspace."""
    item = _draft(server, user)
    deeper = Folder().createFolder(
        Folder().load(item["folderId"], force=True), "deeper", creator=user, parentType="folder"
    )
    assert not FlycutConfig().inWorkspace(_move(item, deeper))


def test_in_workspace_rejects_everything_when_no_workspace_is_configured(server, enabled, user):  # noqa: F811
    item = _config(server, user)
    doc = Dashboard().findOne({"key": "flycut-config"})
    doc["settings"]["workspace_folder_id"] = ""
    doc["settings"]["workspace_path"] = ""
    Dashboard().save(doc)
    assert not FlycutConfig().inWorkspace(item)


def test_in_workspace_rejects_an_item_whose_folder_is_gone(server, enabled, user):  # noqa: F811
    item = _config(server, user)
    Folder().collection.delete_one({"_id": item["folderId"]})
    assert not FlycutConfig().inWorkspace(item)


def test_scope_access_matches_the_item_model(server, enabled, user):  # noqa: F811
    """`WorkspaceScope.hasAccess` must answer exactly as `Item().hasAccess` does.

    It is the same check with the folder resolved from the scope instead of
    loaded per item, so the two may never disagree -- this is what decides
    whose configurations a listing shows.
    """
    submitted = _config(server, user)
    draft = _draft(server, user)
    stranger = User().createUser("stranger", "password123", "No", "Access", "stranger@example.org")
    scope = FlycutConfig().workspaceScope()

    for item in (submitted, draft):
        assert scope.contains(item)
        for who in (user, stranger, None):
            for level in (AccessType.READ, AccessType.WRITE, AccessType.ADMIN):
                assert scope.hasAccess(item, who, level) is Item().hasAccess(item, who, level)
    # The owner can write; a stranger cannot even read.
    assert scope.hasAccess(submitted, user, AccessType.WRITE)
    assert not scope.hasAccess(submitted, stranger, AccessType.READ)


def test_scope_refuses_an_item_it_does_not_hold(server, enabled, user):  # noqa: F811
    """A folder outside the scope has no ACL here, so access is refused."""
    item = _config(server, user)
    elsewhere = Folder().createFolder(user, "Loose", parentType="user", creator=user)
    moved = _move(item, elsewhere)
    scope = FlycutConfig().workspaceScope()
    assert not scope.contains(moved)
    assert not scope.hasAccess(moved, user, AccessType.READ)

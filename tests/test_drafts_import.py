"""What importing uploads out of the Drafts folder may cost the listing.

The import runs inside `GET /flycut/config`, which is what the dashboard
cannot open without. So it may not create anything, may not re-read an upload
it has already judged, and may not fail the request however badly one upload
is formed.
"""

import io
import json

import pytest
from girder.constants import AccessType
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from pytest_girder.assertions import assertStatusOk
from test_api import enabled  # noqa: F401  -- fixture
from test_dashboard import configuration

from girder_flycut.artifacts import CONFIG_FIELD

pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]


def workspace_of(enabled):  # noqa: F811
    return Folder().load(enabled["settings"]["workspace_folder_id"], force=True)


def upload(root, user, name, payload):
    data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return Upload().uploadFromFile(
        io.BytesIO(data),
        len(data),
        name,
        parentType="folder",
        parent=root,
        user=user,
        mimeType="application/json",
    )


def draft_config():
    config = configuration()
    config["run_params"]["stackid"] = ""
    return config


def test_an_unrelated_drafts_folder_does_not_fail_the_listing(server, enabled, user, fsAssetstore):  # noqa: F811
    """A folder someone else named `Drafts` used to 409 the whole dashboard."""
    Folder().createFolder(workspace_of(enabled), "Drafts", creator=user)
    assertStatusOk(server.request("/flycut/config", user=user))


def test_listing_does_not_create_the_drafts_folder(server, enabled, user, fsAssetstore):  # noqa: F811
    """A GET creating folders in the workspace is a side effect nobody asked for."""
    workspace = workspace_of(enabled)
    assertStatusOk(server.request("/flycut/config", user=user))
    assert Folder().findOne({"parentId": workspace["_id"], "parentCollection": "folder", "name": "Drafts"}) is None


def test_a_rejected_upload_is_read_once_not_every_listing(server, enabled, user, fsAssetstore, monkeypatch):  # noqa: F811,E501
    """Uploads that are not configurations stay put, so they are judged once."""
    from girder_flycut.storage import draft_root

    root = draft_root(workspace_of(enabled), user)
    for n in range(5):
        upload(root, user, f"notes{n}.json", {"unrelated": n})

    opens = {"n": 0}
    original = File.open

    def counted(self, *args, **kwargs):
        opens["n"] += 1
        return original(self, *args, **kwargs)

    monkeypatch.setattr(File, "open", counted)

    assertStatusOk(server.request("/flycut/config", user=user))
    assert opens["n"] == 5, "the first listing has to look at each upload once"
    for _ in range(3):
        opens["n"] = 0
        assertStatusOk(server.request("/flycut/config", user=user))
        assert opens["n"] == 0, "a judged upload must not be re-read from the assetstore"


def test_replacing_a_rejected_upload_has_it_examined_again(server, enabled, user, fsAssetstore):  # noqa: F811
    """The marker is keyed to the file, so a corrected upload still imports."""
    from girder_flycut.storage import draft_root

    root = draft_root(workspace_of(enabled), user)
    rejected = upload(root, user, "offline.json", {"unrelated": True})
    assertStatusOk(server.request("/flycut/config", user=user))
    item = Item().load(rejected["itemId"], force=True)
    assert CONFIG_FIELD not in item

    File().remove(File().load(rejected["_id"], force=True))
    config = draft_config()
    data = json.dumps(config).encode()
    Upload().uploadFromFile(
        io.BytesIO(data),
        len(data),
        "offline.json",
        parentType="item",
        parent=item,
        user=user,
        mimeType="application/json",
    )

    response = server.request("/flycut/config", user=user)
    assertStatusOk(response)
    assert [record["_id"] for record in response.json] == [str(item["_id"])]
    assert Item().load(item["_id"], force=True)[CONFIG_FIELD] == config


def test_the_uploader_owns_the_draft_not_whoever_refreshed(server, enabled, user, admin, fsAssetstore):  # noqa: F811
    """`user` is merely whoever opened the dashboard first."""
    from girder_flycut.storage import draft_root

    workspace = workspace_of(enabled)
    Folder().setUserAccess(workspace, admin, AccessType.WRITE, save=True)
    root = draft_root(workspace, user)
    uploaded = upload(root, user, "offline.json", draft_config())

    assertStatusOk(server.request("/flycut/config", user=admin))

    state = Item().load(uploaded["itemId"], force=True)["meta"]["flycut"]
    assert state["createdBy"] == str(user["_id"])


def test_one_unimportable_upload_does_not_fail_the_listing(server, enabled, user, fsAssetstore, monkeypatch):  # noqa: F811,E501
    """Whatever goes wrong adopting an upload, the dashboard still opens."""
    from girder_flycut import drafts
    from girder_flycut.storage import draft_root

    root = draft_root(workspace_of(enabled), user)
    upload(root, user, "offline.json", draft_config())

    def explode(*args, **kwargs):
        raise RuntimeError("the draft folder could not be created")

    monkeypatch.setattr(drafts, "_adopt", explode)

    for _ in range(2):
        response = server.request("/flycut/config", user=user)
        assertStatusOk(response)
        assert response.json == []

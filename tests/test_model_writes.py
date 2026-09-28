"""The model's own write methods, and what a whole-document save must not disturb.

Backend review item 3 moved the plain `meta.flycut` writes behind
`FlycutConfig`, which means they go through `Item().save()` and therefore
through girder-jsonforms' `coerce_metadata_dates` handler. That was exactly
what made them direct Mongo writes in the first place, until PR #22 turned the
timestamps into dates and moved the snapshot out of `meta`. These tests hold
that open: a save must leave the snapshot and every stored timestamp alone.
"""

import copy
import json

import pytest
from girder.models.item import Item
from pytest_girder.assertions import assertStatus, assertStatusOk
from test_api import enabled  # noqa: F401  -- fixture
from test_dashboard import configuration

from girder_flycut.artifacts import CONFIG_FIELD
from girder_flycut.models import FlycutConfig
from girder_flycut.schema import stack_id

pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]


def _registered(server, user, stack="00005"):
    """A configuration all the way through the lifecycle, as stored."""
    payload = configuration()
    payload["run_params"]["stackid"] = stack
    saved = server.request(
        "/flycut/config",
        method="POST",
        user=user,
        params={"submit": True, "validated": True, "config": json.dumps(payload)},
    )
    assertStatusOk(saved)
    endpoint = "/flycut/config/" + saved.json["_id"]
    assertStatusOk(server.request(endpoint + "/generate", method="POST", user=user))
    assertStatusOk(server.request(endpoint + "/register", method="POST", user=user))
    return Item().load(saved.json["_id"], force=True)


def test_set_state_leaves_the_rest_of_the_document_untouched(server, enabled, user):  # noqa: F811
    """The claim item 3 rests on: a model save on a registered configuration is lossless."""
    item = _registered(server, user)
    before = copy.deepcopy(item)

    FlycutConfig().setState(item, busy=False)

    after = Item().load(item["_id"], force=True)
    assert after[CONFIG_FIELD] == before[CONFIG_FIELD], "the operator's snapshot was rewritten"
    for path in ("savedAt", "submittedAt", "generatedAt", "registeredAt"):
        assert after["meta"]["flycut"][path] == before["meta"]["flycut"][path], path
    assert after["meta"]["flycut"]["registration"] == before["meta"]["flycut"]["registration"]
    # Everything under meta except the one field we changed.
    before["meta"]["flycut"]["busy"] = False
    assert after["meta"] == before["meta"]


def test_set_state_reads_the_document_back_before_writing(server, enabled, user):  # noqa: F811
    """A caller's copy is stale by the time it records what it did.

    `generate` holds the document it loaded before uploading anything, and
    `claimBusy` flipped `busy` on it in between. Saving that copy back would
    undo both, which is why `setState` reloads.
    """
    item = _registered(server, user)
    stale = copy.deepcopy(item)
    assert FlycutConfig().claimBusy(item, "generate")
    FlycutConfig().setState(stale, overwriteSafe=False)

    after = Item().load(item["_id"], force=True)
    assert after["meta"]["flycut"]["busy"] is True, "the stale copy clobbered the claim"
    assert after["meta"]["flycut"]["overwriteSafe"] is False


def test_set_state_unsets_what_it_is_asked_to(server, enabled, user):  # noqa: F811
    item = _registered(server, user)
    FlycutConfig().setState(item, status="submitted", unset=("files", "registration"))
    state = Item().load(item["_id"], force=True)["meta"]["flycut"]
    assert state["status"] == "submitted"
    assert "files" not in state and "registration" not in state


def test_set_state_does_not_rename_on_a_sibling_collision(server, enabled, user):  # noqa: F811
    """`Item.validate` appends `(n)` to a changed name; a save must not trip it."""
    item = _registered(server, user)
    Item().createItem(item["name"] + " (1)", creator=user, folder={"_id": item["folderId"]})
    FlycutConfig().setState(item, busy=False)
    assert Item().load(item["_id"], force=True)["name"] == item["name"]


def test_set_state_on_a_deleted_configuration_is_a_no_op(server, enabled, user):  # noqa: F811
    item = _registered(server, user)
    Item().collection.delete_one({"_id": item["_id"]})
    assert FlycutConfig().setState(item, busy=False) is None


def test_claim_busy_is_a_compare_and_swap(server, enabled, user):  # noqa: F811
    item = _registered(server, user)
    assert FlycutConfig().claimBusy(item, "generate") is True
    assert FlycutConfig().claimBusy(item, "register") is False
    state = Item().load(item["_id"], force=True)["meta"]["flycut"]
    assert state["busy"] is True and state["action"] == "generate"


def test_claim_status_only_moves_from_what_it_expects(server, enabled, user):  # noqa: F811
    item = _registered(server, user)
    assert FlycutConfig().claimStatus(item, expect="draft", become="deleting") is False
    assert Item().load(item["_id"], force=True)["meta"]["flycut"]["status"] == "registered"
    assert FlycutConfig().claimStatus(item, expect="registered", become="submitted") is True
    assert Item().load(item["_id"], force=True)["meta"]["flycut"]["status"] == "submitted"


def test_replace_refuses_when_the_guard_does_not_match(server, enabled, user):  # noqa: F811
    """What stops one request overwriting a draft another is submitting."""
    item = _registered(server, user)
    state = {"status": "draft", "workspaceId": item["meta"]["flycut"]["workspaceId"]}
    assert FlycutConfig().replace(item, "renamed", state, {}, expect="draft") is None
    assert Item().load(item["_id"], force=True)["name"] == item["name"]

    stored = FlycutConfig().replace(item, "renamed", state, {}, expect="registered")
    assert stored["name"] == "renamed"
    assert stored["meta"]["flycut"] == state


def test_a_draft_being_deleted_refuses_a_second_delete(server, enabled, user):  # noqa: F811
    """The claim and its roll-back, from the route that depends on them."""
    draft = server.request("/flycut/config", method="POST", user=user, params={"config": json.dumps(configuration())})
    assertStatusOk(draft)
    endpoint = "/flycut/config/" + draft.json["_id"]
    item = Item().load(draft.json["_id"], force=True)

    # Another request got there first and is part-way through deleting it.
    assert FlycutConfig().claimStatus(item, expect="draft", become="deleting") is True
    assertStatus(server.request(endpoint, method="DELETE", user=user), 409)

    # That request then failed, and rolled the claim back.
    assert FlycutConfig().claimStatus(item, expect="deleting", become="draft") is True
    assertStatusOk(server.request(endpoint, method="DELETE", user=user))


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ({"run_params": {"stackid": "  f100 "}}, "F100"),
        ({"run_params": {"stackid": "00005"}}, "00005"),
        ({"run_params": {}}, ""),
        ({}, ""),
        ({"run_params": {"stackid": None}}, "NONE"),
    ],
)
def test_stack_id_normalises_one_way_everywhere(stored, expected):
    """One definition, because every comparison of two stack IDs has to agree.

    The `None` case is deliberate rather than desirable: it is what the four
    hand-written copies already produced, and nothing reaches it -- a
    configuration without a stack ID is refused by validation before any of
    them runs.
    """
    assert stack_id(stored) == expected


def test_stack_id_reads_either_stored_layout(server, enabled, user):  # noqa: F811
    """`configuration()` handles the packed and unpacked forms; `stackId` inherits that."""
    item = _registered(server, user, stack="0000B")
    assert FlycutConfig().stackId(item) == "0000B"
    assert "run_parameters" in item[CONFIG_FIELD], "the stored snapshot is the packed form"

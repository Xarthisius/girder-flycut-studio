"""The pieces `save_config` was split into, tested without a server.

Backend review item 4. The name derivation in particular was a nested ternary
with an `or` in the middle -- three of the four cases below were not obvious
from reading it, which is why they are written down.
"""

import copy
from datetime import datetime

import pytest
from girder.exceptions import RestException

from girder_flycut.rest.config import ConfigRoutes

ROUTES = ConfigRoutes()
USER = {"_id": "6100000000000000000000ff"}


@pytest.mark.parametrize(
    ("given", "stack", "submit", "expected"),
    [
        # Submitting always names the configuration for its stack ...
        ("whatever the operator typed", "00005", True, "stack00005-config"),
        ("", "00005", True, "stack00005-config"),
        # ... while a draft keeps what was typed ...
        ("whatever the operator typed", "00005", False, "whatever the operator typed"),
        ("  padded  ", "00005", False, "padded"),
        # ... and falls back to its stack, or to a placeholder when it has none.
        ("", "00005", False, "stack00005-config"),
        ("", "", False, "Untitled draft"),
    ],
)
def test_name_derivation(given, stack, submit, expected):
    assert ROUTES._name(given, stack, submit) == expected


def test_name_is_length_checked_even_when_it_is_discarded():
    """Submitting overwrites the name, but an over-long one is still refused."""
    with pytest.raises(RestException):
        ROUTES._name("x" * 161, "00005", True)
    assert ROUTES._name("x" * 160, "00005", False) == "x" * 160


def test_snapshot_drops_what_the_server_owns():
    packed = {"run_parameters": {"stackid": "00005"}, "createdBy": "spoofed", "preset": "spoofed"}
    assert ROUTES._snapshot(packed) == {"run_parameters": {"stackid": "00005"}, "preset": None}


def test_snapshot_packs_the_section_form_and_does_not_alias_it():
    sections = {"run_params": {"stackid": "00005"}, "laser_params": [], "custom_fields": {}}
    before = copy.deepcopy(sections)
    rendered = ROUTES._snapshot(sections)
    assert "run_parameters" in rendered
    assert sections == before, "the caller's configuration was mutated"


def test_state_of_a_draft_carries_the_builder_row_layout():
    state = ROUTES._state(None, "ws", USER, {"custom_field_rows": [["a"]]}, submit=False)
    assert state["status"] == "draft"
    assert state["customFieldRows"] == [["a"]]
    assert "submittedAt" not in state
    assert state["overwriteSafe"] is True
    assert isinstance(state["savedAt"], datetime)


def test_state_of_a_submission_is_stamped_once():
    state = ROUTES._state(None, "ws", USER, {"custom_field_rows": [["a"]]}, submit=True)
    assert state["status"] == "submitted"
    assert state["submittedAt"] == state["savedAt"], "the two timestamps must be the same instant"
    assert "customFieldRows" not in state, "submitting renders the row layout away"


def test_state_inherits_overwrite_safe_from_the_draft_it_replaces():
    """Once a stack has been overwritten it stays flagged, through every later save."""
    draft = {"meta": {"flycut": {"overwriteSafe": False}}}
    assert ROUTES._state(draft, "ws", USER, {}, submit=True)["overwriteSafe"] is False
    assert ROUTES._state({"meta": {"flycut": {}}}, "ws", USER, {}, submit=True)["overwriteSafe"] is True

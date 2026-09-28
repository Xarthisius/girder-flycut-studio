"""The couplings to girder-jsonforms that only exist when its plugin is loaded.

girder-jsonforms binds `coerce_metadata_dates` to `model.item.save`, which
recursively rewrites ISO-8601 strings anywhere under `meta` into BSON
datetimes. A configuration carries a verbatim JSON snapshot in `meta.config`
that is written into a generated artifact and backs the stack's IGSN, so it has
to survive that untouched.

These tests exist because loading only the flycut plugin leaves those bindings
unregistered, and every one of them silently passes.
"""

import json

import pytest
from girder import events
from girder.models.item import Item
from pytest_girder.assertions import assertStatusOk
from test_api import enabled  # noqa: F401
from test_dashboard import configuration

pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]

# A custom field value a user could plausibly type that `coerce_metadata_dates`
# matches: its regex accepts a bare date, not only a full timestamp.
DATE_LIKE = "2026-01-15"


def _submit(server, user, stack, custom=None):
    payload = configuration()
    payload["run_params"]["stackid"] = stack
    payload["custom_fields"].update(custom or {})
    response = server.request(
        "/flycut/config",
        method="POST",
        user=user,
        params={"submit": True, "validated": True, "config": json.dumps(payload)},
    )
    assertStatusOk(response)
    return response.json


def test_jsonforms_hooks_are_bound(server, enabled):  # noqa: F811
    """Without these, the test below cannot fail and proves nothing."""
    assert "jsonforms" in events._mapping.get("model.item.save", {})
    assert "jsonforms" in events._mapping.get("model.item.save.after", {})


def test_the_config_snapshot_survives_the_save_path(server, enabled, user):  # noqa: F811
    record = _submit(server, user, "F920", {"sample_date": DATE_LIKE})
    stored = Item().load(record["_id"], force=True)["meta"]["config"]
    value = stored["custom_fields"]["sample_date"]
    assert value == DATE_LIKE, f"the snapshot was coerced to {value!r}"
    assert isinstance(value, str)


def test_a_coerced_snapshot_would_break_generation(server, enabled, user, fsAssetstore):  # noqa: F811
    """Why the snapshot's types matter: it is serialized into an artifact.

    The custom fields go straight into `-metadata.json`, and `json.dumps`
    refuses a datetime -- so a coerced snapshot is a failed generation, not a
    cosmetic difference.
    """
    record = _submit(server, user, "F921", {"sample_date": DATE_LIKE})
    response = server.request(f"/flycut/config/{record['_id']}/generate", method="POST", user=user)
    assertStatusOk(response)
    assert len(response.json["files"]) == 3

    stored = Item().load(record["_id"], force=True)["meta"]["config"]
    with pytest.raises(TypeError):
        import datetime

        json.dumps({**stored, "coerced": datetime.datetime.now()}, allow_nan=False)

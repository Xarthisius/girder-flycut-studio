"""The pre-migration layouts, and what `migrations.run()` does to them."""

import datetime

import pytest
from girder.models.folder import Folder
from girder.models.item import Item
from test_api import enabled  # noqa: F401

from girder_flycut import migrations
from girder_flycut.artifacts import CONFIG_FIELD, configuration

pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]

SNAPSHOT = {"run_params": {"stackid": "F700"}, "custom_fields": {"sample_date": "2026-01-15"}}


def _legacy(user, name, meta):
    folder = Folder().createFolder(user, name, parentType="user", creator=user, reuseExisting=True)
    item = Item().createItem(name, creator=user, folder=folder)
    Item().collection.update_one({"_id": item["_id"]}, {"$set": {"meta": meta}})
    return Item().load(item["_id"], force=True)


def test_moves_meta_config_out_of_meta(server, enabled, user):  # noqa: F811
    item = _legacy(user, "old-a", {"flycut": {"status": "submitted"}, "config": SNAPSHOT})
    assert configuration(item) == SNAPSHOT  # readable before the migration

    migrations.run()

    after = Item().load(item["_id"], force=True)
    assert after[CONFIG_FIELD] == SNAPSHOT
    assert "config" not in after["meta"]
    assert configuration(after) == SNAPSHOT


def test_moves_the_older_meta_flycut_config(server, enabled, user):  # noqa: F811
    item = _legacy(user, "old-b", {"flycut": {"status": "submitted", "config": SNAPSHOT}})
    migrations.run()

    after = Item().load(item["_id"], force=True)
    assert after[CONFIG_FIELD] == SNAPSHOT
    assert "config" not in after["meta"]["flycut"]


def test_meta_config_wins_when_an_item_carries_both(server, enabled, user):  # noqa: F811
    """`configuration()` preferred meta.config, so the migration must too."""
    older = {"run_params": {"stackid": "OLDER"}}
    item = _legacy(user, "old-c", {"flycut": {"status": "submitted", "config": older}, "config": SNAPSHOT})
    migrations.run()

    after = Item().load(item["_id"], force=True)
    assert after[CONFIG_FIELD] == SNAPSHOT
    assert "config" not in after["meta"]
    assert "config" not in after["meta"]["flycut"]


def test_the_snapshot_is_not_coerced_on_the_way(server, enabled, user):  # noqa: F811
    """The whole point: a date-like value in the snapshot stays a string."""
    item = _legacy(user, "old-d", {"flycut": {"status": "submitted"}, "config": SNAPSHOT})
    migrations.run()

    after = Item().load(item["_id"], force=True)
    assert after[CONFIG_FIELD]["custom_fields"]["sample_date"] == "2026-01-15"
    assert isinstance(after[CONFIG_FIELD]["custom_fields"]["sample_date"], str)


def test_converts_the_lifecycle_timestamps(server, enabled, user):  # noqa: F811
    item = _legacy(
        user,
        "old-e",
        {
            "flycut": {
                "status": "registered",
                "savedAt": "2026-01-02T03:04:05+00:00",
                "submittedAt": "2026-01-02T03:04:05+00:00",
                "generatedAt": "2026-01-03T00:00:00+00:00",
                "registeredAt": "2026-01-04T00:00:00Z",
            },
            "config": SNAPSHOT,
        },
    )
    migrations.run()

    flycut = Item().load(item["_id"], force=True)["meta"]["flycut"]
    for field in ("savedAt", "submittedAt", "generatedAt", "registeredAt"):
        assert isinstance(flycut[field], datetime.datetime), f"{field} is {type(flycut[field])}"
    assert flycut["savedAt"] == datetime.datetime(2026, 1, 2, 3, 4, 5, tzinfo=datetime.timezone.utc)
    assert flycut["registeredAt"] == datetime.datetime(2026, 1, 4, tzinfo=datetime.timezone.utc)


def test_converts_the_timestamp_inside_the_registration_receipt(server, enabled, user):  # noqa: F811
    """Receipts written before this change carry a string; Mongo holds dates."""
    item = _legacy(
        user,
        "old-h",
        {
            "flycut": {
                "status": "registered",
                "registration": {"igsn": "X-1", "registeredAt": "2026-01-04T05:06:07+00:00"},
            },
            "config": SNAPSHOT,
        },
    )
    migrations.run()

    receipt = Item().load(item["_id"], force=True)["meta"]["flycut"]["registration"]
    assert receipt["registeredAt"] == datetime.datetime(2026, 1, 4, 5, 6, 7, tzinfo=datetime.timezone.utc)
    assert receipt["igsn"] == "X-1"


def test_an_unparseable_timestamp_is_left_alone(server, enabled, user):  # noqa: F811
    """One bad document must not abort the batch or lose its value."""
    item = _legacy(user, "old-f", {"flycut": {"status": "draft", "savedAt": "not a date"}, "config": SNAPSHOT})
    migrations.run()

    flycut = Item().load(item["_id"], force=True)["meta"]["flycut"]
    assert flycut["savedAt"] == "not a date"


def test_running_twice_changes_nothing(server, enabled, user):  # noqa: F811
    item = _legacy(
        user, "old-g", {"flycut": {"status": "submitted", "savedAt": "2026-01-02T03:04:05+00:00"}, "config": SNAPSHOT}
    )
    first = migrations.run()
    assert first["moved"] >= 1
    after_first = Item().load(item["_id"], force=True)

    second = migrations.run()
    assert second == {"moved": 0, "stale": 0, "timestamps": 0, "droppedStackLocks": False}
    assert Item().load(item["_id"], force=True) == after_first


def test_leaves_unrelated_items_alone(server, enabled, user):  # noqa: F811
    """Another plugin's `meta.config` is not ours to move."""
    folder = Folder().createFolder(user, "other", parentType="user", creator=user, reuseExisting=True)
    other = Item().createItem("not-flycut", creator=user, folder=folder)
    Item().collection.update_one({"_id": other["_id"]}, {"$set": {"meta": {"config": {"someone": "else"}}}})

    migrations.run()

    after = Item().load(other["_id"], force=True)
    assert after["meta"]["config"] == {"someone": "else"}
    assert CONFIG_FIELD not in after


def test_drops_the_mongo_stack_lock_collection(server, enabled, user):  # noqa: F811
    """The mutex moved to Redis, so its collection is left holding expired locks."""
    database = Item().collection.database
    database[migrations.STACK_LOCK_COLLECTION].insert_one({"_id": "F100", "acquired": datetime.datetime.now()})
    assert migrations.STACK_LOCK_COLLECTION in database.list_collection_names()

    assert migrations.run()["droppedStackLocks"] is True
    assert migrations.STACK_LOCK_COLLECTION not in database.list_collection_names()

    # Dropping what is not there is a no-op, so every later load is cheap.
    assert migrations.run()["droppedStackLocks"] is False

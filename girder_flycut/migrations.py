"""One-time document migrations, run at plugin load.

Both of these move data that older releases wrote into `meta`, where
girder-jsonforms' `coerce_metadata_dates` handler reaches it:

* the configuration snapshot, out of `meta.config` (and the older
  `meta.flycut.config`) and into a top-level field no handler touches;
* the four lifecycle timestamps, from ISO-8601 strings into BSON dates, so
  they can be sorted and range-queried as the timestamps they are.

Every step is expressed as a single `update_many` guarded by the shape it is
about to change, so running it twice is a no-op and a half-finished run simply
resumes. Nothing here may abort the plugin load -- see `FlycutPlugin._guard`.
"""

import logging

from girder.models.item import Item

from .artifacts import CONFIG_FIELD

logger = logging.getLogger(__name__)

# Every timestamp this plugin stores, as a path under the item document. The
# rule is: a timestamp in Mongo is a date, and a timestamp inside a JSON
# document that mirrors a file stays the ISO string the file holds.
# `registration` is the receipt, and `machinedAt` is read by generate.py but
# only ever set externally.
TIMESTAMPS = (
    "meta.flycut.savedAt",
    "meta.flycut.submittedAt",
    "meta.flycut.generatedAt",
    "meta.flycut.registeredAt",
    "meta.flycut.machinedAt",
    "meta.flycut.registration.registeredAt",
)

# A configuration in a pre-migration layout: it has flycut state, it has no
# snapshot at the new location, and it has one at an old one.
_LEGACY = {
    CONFIG_FIELD: {"$exists": False},
    "meta.flycut": {"$exists": True},
    "$or": [{"meta.config": {"$exists": True}}, {"meta.flycut.config": {"$exists": True}}],
}


def move_config_out_of_meta():
    """Relocate the snapshot, preferring `meta.config` as `configuration()` did."""
    items = Item().collection
    moved = items.update_many(
        _LEGACY,
        [
            {"$set": {CONFIG_FIELD: {"$ifNull": ["$meta.config", "$meta.flycut.config"]}}},
            {"$unset": ["meta.config", "meta.flycut.config"]},
        ],
    ).modified_count
    # An item migrated by an earlier partial run, or written by a newer server
    # against an older document, can hold both. The new field is authoritative.
    stale = items.update_many(
        {
            CONFIG_FIELD: {"$exists": True},
            "$or": [{"meta.config": {"$exists": True}}, {"meta.flycut.config": {"$exists": True}}],
        },
        {"$unset": {"meta.config": "", "meta.flycut.config": ""}},
    ).modified_count
    return moved, stale


def coerce_lifecycle_timestamps():
    """Turn the ISO strings under `meta.flycut` into dates.

    `$convert`'s `onError` returns the original value, so a document with an
    unparseable timestamp is left exactly as it was rather than aborting the
    batch and blocking every document after it.
    """
    items = Item().collection
    converted = 0
    for path in TIMESTAMPS:
        converted += items.update_many(
            {path: {"$type": "string"}},
            [{"$set": {path: {"$convert": {"input": f"${path}", "to": "date", "onError": f"${path}"}}}}],
        ).modified_count
    return converted


def run():
    """Apply every migration. Idempotent; safe to call on each load."""
    moved, stale = move_config_out_of_meta()
    converted = coerce_lifecycle_timestamps()
    if moved or stale or converted:
        logger.info(
            "flycut: migrated %d configuration snapshot(s) out of meta, cleaned %d stale copy/copies, "
            "converted %d timestamp field(s) to dates",
            moved,
            stale,
            converted,
        )
    return {"moved": moved, "stale": stale, "timestamps": converted}

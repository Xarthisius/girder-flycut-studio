"""The per-stack mutex, behind the model layer."""

from contextlib import contextmanager
from datetime import datetime, timezone

from girder.exceptions import RestException
from girder.models.model_base import Model
from pymongo.errors import DuplicateKeyError

# How long a stack may stay locked before Mongo reclaims it. Generation is
# synchronous, so a legitimate operation finishes far inside this; the window
# only has to be wider than the slowest honest request.
STACK_LOCK_TTL_SECONDS = 900


class StackLock(Model):
    """A mutex document per stack ID, expired by Mongo rather than by us.

    One document exists for as long as a stack is being changed; its ``_id`` is
    the normalised stack ID, which is what makes the insert the mutex.
    """

    def initialize(self):
        self.name = "flycut_stack_locks"

    def validate(self, doc):
        # Documents are written by `hold()` with insert_one, never through
        # save(), so this exists to satisfy the abstract base rather than to
        # guard anything.
        return doc

    def ensureExpiry(self):
        """Give the stack mutex a TTL so a crashed worker cannot wedge a stack.

        Without this, a process that dies between insert_one and delete_one
        leaves the lock document behind and every later request for that stack
        ID answers 409 forever, with no operator-visible way to clear it.

        Documents written before this index existed carry no `acquired` field
        and are therefore never expired by it -- drop them by hand if any are
        stuck.
        """
        self.collection.create_index("acquired", expireAfterSeconds=STACK_LOCK_TTL_SECONDS)

    @contextmanager
    def hold(self, stack):
        """Hold the mutex for ``stack``, releasing it however the body exits."""
        try:
            self.collection.insert_one({"_id": stack, "acquired": datetime.now(timezone.utc)})
        except DuplicateKeyError:
            raise RestException("This stack is being changed. Try again when that operation finishes.", code=409)
        try:
            yield
        finally:
            self.collection.delete_one({"_id": stack})

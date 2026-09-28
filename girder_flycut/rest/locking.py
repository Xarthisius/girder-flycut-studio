"""The per-stack mutex, and the decorator that applies it to a route."""

import os
from contextlib import contextmanager, suppress
from functools import lru_cache, wraps

import redis
from girder.exceptions import RestException

from ..artifacts import configuration
from ..schema import stack_id

# How long a stack may stay locked before Redis reclaims it. Generation is
# synchronous, so a legitimate operation finishes far inside this; the window
# only has to be wider than the slowest honest request.
STACK_LOCK_TTL_SECONDS = 900


@lru_cache
def _client():
    """The Redis that Girder core already publishes notifications through.

    Not optional infrastructure: `girder.notification` imports `redis` at
    module scope and reads this same variable, so a Girder that serves
    requests at all has one configured.
    """
    return redis.Redis.from_url(os.environ.get("GIRDER_NOTIFICATION_REDIS_URL", "redis://localhost:6379"))


@contextmanager
def stack_mutex(stack):
    """Hold the mutex for `stack`, releasing it however the body exits.

    A thin wrapper over `redis-py`'s own lock, which is what makes the release
    ownership-checked: it stores a token per acquisition and releases through a
    Lua script that compares it. Without that, a holder whose lock had already
    expired would delete its successor's on the way out and leave two writers
    running unserialized.

    Deliberately *not* `girder_jsonforms.lib.locks.distributed_lock`, which
    logs and proceeds when Redis errors or acquisition times out. That is
    right for the idempotent startup step it was written for and wrong here:
    this mutex guards IGSN registration, where running twice is not
    recoverable. So it fails closed -- an unreachable Redis is a 503, not a
    silent loss of mutual exclusion. The trade-off is real: during a Redis
    outage these requests are refused where previously they carried on.
    """
    lock = _client().lock(f"flycut:stack:{stack}", timeout=STACK_LOCK_TTL_SECONDS, blocking=False)
    try:
        acquired = lock.acquire()
    except redis.RedisError as exc:
        raise RestException("The lock service is unavailable. Try again shortly.", code=503) from exc
    if not acquired:
        raise RestException("This stack is being changed. Try again when that operation finishes.", code=409)
    try:
        yield
    finally:
        # Releasing a lock that expired underneath us is the ordinary end of
        # an overrunning request, not an error worth propagating -- and the
        # token check means we cannot take someone else's with us.
        with suppress(redis.RedisError, redis.exceptions.LockError):
            lock.release()


def stack_locked(method):
    """Hold this stack's mutex for the length of the call.

    Two shapes of route use this. `save_config` is handed a builder
    configuration and only locks when it is being submitted, since a draft
    save claims no stack. The three lifecycle transitions are handed the
    configuration itself, by `modelParam`, so the stack ID comes from a
    document this decorator no longer has to load a second time.

    Sits *below* `@gated`, so the dashboard check has already run and a
    request about to be refused never takes the lock.
    """

    @wraps(method)
    def wrapped(self, *args, **kwargs):
        if method.__name__ == "save_config":
            if not kwargs.get("submit", False):
                return method(self, *args, **kwargs)
            raw = kwargs.get("config", args[0] if args else {})
        else:
            raw = configuration(kwargs["item"])
        stack = stack_id(raw)
        if not stack:
            # The payload names no stack, so there is no shared resource to
            # serialize on yet. Locking `""` instead would make every
            # malformed submit exclude every other one and answer "this stack
            # is being changed" where the handler's own validation is about to
            # say what is actually wrong.
            return method(self, *args, **kwargs)
        with stack_mutex(stack):
            return method(self, *args, **kwargs)

    return wrapped

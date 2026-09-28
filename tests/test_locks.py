"""The per-stack mutex: mutual exclusion, ownership-checked release, and failing closed."""

import json
import time

import pytest
import redis
from girder.exceptions import RestException
from pytest_girder.assertions import assertStatus, assertStatusOk
from test_api import enabled  # noqa: F401  -- fixture
from test_dashboard import configuration

from girder_flycut.rest import locking

pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]


@pytest.fixture(autouse=True)
def clean_locks():
    """Leave no lock keys behind: Redis outlives any one server fixture."""

    def drop():
        for key in locking._client().scan_iter("flycut:stack:*"):
            locking._client().delete(key)

    drop()
    yield
    drop()


def test_mutex_excludes_the_same_stack_and_releases_on_error():
    with locking.stack_mutex("F100"):
        with pytest.raises(RestException) as excinfo:
            with locking.stack_mutex("F100"):
                pass
        assert excinfo.value.code == 409
        # A different stack is unaffected.
        with locking.stack_mutex("F200"):
            pass

    # The outer hold released, so the stack is free again.
    with locking.stack_mutex("F100"):
        pass

    with pytest.raises(ZeroDivisionError):
        with locking.stack_mutex("F100"):
            1 / 0
    assert locking._client().get("flycut:stack:F100") is None


def test_release_is_ownership_checked_after_the_lock_expires(monkeypatch):
    """Regression: an overrunning holder must not delete its successor's lock.

    Deleting by key alone -- which is what the Mongo mutex this replaced did --
    means that once the TTL reclaims a lock and a second request legitimately
    acquires it, the first holder's `finally` takes the *second* holder's lock
    with it and both writers run unserialized.
    """
    monkeypatch.setattr(locking, "STACK_LOCK_TTL_SECONDS", 1)
    with locking.stack_mutex("F300"):
        time.sleep(1.2)  # the TTL reclaims it while we are still working
        # A second request now legitimately acquires the stack.
        second = locking._client().lock("flycut:stack:F300", timeout=60, blocking=False)
        assert second.acquire()
    # Our release compared tokens and found the lock was no longer ours.
    assert second.owned()
    second.release()


def test_an_unreachable_redis_fails_closed(monkeypatch):
    """A Redis outage refuses the request rather than running unserialized.

    Deliberate, and the one behaviour change in replacing the Mongo mutex:
    `girder_jsonforms.lib.locks.distributed_lock` logs and proceeds here, which
    would grant the same stack to two writers precisely when nothing can tell
    that it had.
    """
    dead = redis.Redis.from_url("redis://127.0.0.1:1/", socket_connect_timeout=0.2)
    monkeypatch.setattr(locking, "_client", lambda: dead)
    with pytest.raises(RestException) as excinfo:
        with locking.stack_mutex("F400"):
            pytest.fail("the critical section must not run without the lock")
    assert excinfo.value.code == 503


def _submit(server, user, payload):
    return server.request(
        "/flycut/config",
        method="POST",
        user=user,
        params={"submit": True, "validated": True, "config": json.dumps(payload)},
    )


@pytest.mark.parametrize(
    "mangle",
    [
        pytest.param(lambda c: c["run_params"].pop("stackid"), id="no-stackid"),
        pytest.param(lambda c: c.pop("run_params"), id="no-run-params"),
    ],
)
def test_a_stack_less_submit_is_refused_by_validation_not_by_the_lock(server, enabled, user, mangle):  # noqa: F811
    """Regression: two unrelated malformed submits used to exclude each other.

    The decorator derives the stack ID before the handler validates anything,
    so a payload naming no stack took the lock `""`. Any second such request
    anywhere in the instance was then told "this stack is being changed" --
    both wrong and misleading, since neither named a stack at all.

    Holding the empty-string lock is what a malformed submit already in flight
    looks like from here; the fix is that nothing derives that lock any more.
    """
    payload = configuration()
    mangle(payload)

    inflight = locking._client().lock("flycut:stack:", timeout=60, blocking=False)
    assert inflight.acquire()
    try:
        response = _submit(server, user, payload)
    finally:
        inflight.release()

    assertStatus(response, 400)
    assert "being changed" not in response.json["message"]
    # Nothing was locked on the way through, either.
    assert not list(locking._client().scan_iter("flycut:stack:*"))


def test_a_submitted_stack_takes_its_own_lock_and_releases_it(server, enabled, user):  # noqa: F811
    payload = configuration()
    payload["run_params"]["stackid"] = "F900"
    assertStatusOk(_submit(server, user, payload))
    assert not list(locking._client().scan_iter("flycut:stack:*"))

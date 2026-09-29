"""What the three listing endpoints cost, counted rather than reasoned about.

Opening the dashboard calls all three at once, so their per-request query
counts have to be independent of how many configurations the workspace holds.
Each test measures the same endpoint at two sizes and asserts the difference.

They were not. `GET /flycut/config` cost `N+2` `Dashboard.findOne` and `3N`
`Folder.load`; the other two cost `N+1` and `2N`. All three are now four
queries flat -- two `Dashboard.findOne` (the gate's and the policy's), one
`Folder.find` resolving the workspace scope, and one `Item.find`.
"""

import json

import pytest
from girder.models.folder import Folder
from girder.models.item import Item
from girder_dashboards.models.dashboard import Dashboard
from pytest_girder.assertions import assertStatusOk
from test_api import enabled  # noqa: F401  -- fixture
from test_dashboard import configuration

pytestmark = [pytest.mark.plugin("flycut"), pytest.mark.plugin("jsonforms")]

ENDPOINTS = ["/flycut/config", "/flycut/stack-states", "/flycut/submitted-stacks"]

# Every five-character Crockford stack ID is distinct, so each submit claims a
# folder of its own and the workspace grows exactly as a real one does.
STACKS = ["0000{}".format(c) for c in "123456789ABCDEFG"]


def _submit(server, user, stack):
    payload = configuration()
    payload["run_params"]["stackid"] = stack
    response = server.request(
        "/flycut/config",
        method="POST",
        user=user,
        params={"submit": True, "validated": True, "config": json.dumps(payload)},
    )
    assertStatusOk(response)


class _Counter:
    """Count calls to the two models the listing path leans on."""

    def __init__(self, monkeypatch):
        self.counts = {}
        for model, method in [(Dashboard, "findOne"), (Folder, "load"), (Folder, "find"), (Item, "find")]:
            self._wrap(monkeypatch, model, method)

    def _wrap(self, monkeypatch, model, method):
        original = getattr(model, method)
        name = f"{model.__name__}.{method}"
        self.counts[name] = 0

        def counted(*args, **kwargs):
            self.counts[name] += 1
            return original(*args, **kwargs)

        monkeypatch.setattr(model, method, counted)

    def reset(self):
        for name in self.counts:
            self.counts[name] = 0


@pytest.fixture
def counter(monkeypatch):
    return _Counter(monkeypatch)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_listing_cost_does_not_grow_with_the_workspace(server, enabled, user, counter, endpoint):  # noqa: F811
    """The exit criterion for the N+1 item: adding configurations adds no queries."""
    for stack in STACKS[:4]:
        _submit(server, user, stack)
    counter.reset()
    assertStatusOk(server.request(endpoint, user=user))
    small = dict(counter.counts)

    for stack in STACKS[4:]:
        _submit(server, user, stack)
    counter.reset()
    assertStatusOk(server.request(endpoint, user=user))
    large = dict(counter.counts)

    assert large == small, f"{endpoint} cost grew from 4 to {len(STACKS)} configurations: {small} -> {large}"

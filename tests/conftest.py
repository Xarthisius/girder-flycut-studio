import pytest
from girder_dashboards import registry


@pytest.fixture(autouse=True)
def clean_dashboard_registry():
    """Restore girder-dashboards' module-global registry between tests.

    `registry._dashboards` and `registry._listeners` outlive any single server
    fixture, so a test that registers a dashboard would otherwise leak it into
    the next one.

    This used to also monkeypatch `PluginRegistry._listPluginEntryPoints` to
    hide unrelated installed plugins. That was unnecessary: pytest_girder loads
    only the plugins named in a `@pytest.mark.plugin` marker.

    That cuts both ways, which is why the suites name **two** plugins. Loading
    only flycut leaves girder-jsonforms' event bindings unregistered, and
    `coerce_metadata_dates` on `model.item.save` is the one the configuration
    snapshot depends on being there. See tests/test_jsonforms_hooks.py, which
    asserts the bindings exist so that dropping the marker fails loudly rather
    than quietly making a class of test unable to fail.
    """
    saved = dict(registry._dashboards)
    listeners = list(registry._listeners)
    yield
    registry._dashboards.clear()
    registry._dashboards.update(saved)
    registry._listeners[:] = listeners

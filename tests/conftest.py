import pytest


@pytest.fixture(autouse=True)
def clean_dashboard_registry():
    """Restore girder-dashboards' module-global registry between tests.

    `registry._dashboards` and `registry._listeners` outlive any single server
    fixture, so a test that registers a dashboard would otherwise leak it into
    the next one.

    This used to also monkeypatch `PluginRegistry._listPluginEntryPoints` to
    hide unrelated installed plugins. That was unnecessary: pytest_girder only
    loads the plugins named in a `@pytest.mark.plugin` marker, so the ones
    girder-jsonforms drags in never start.
    """
    from girder_dashboards import registry
    saved = dict(registry._dashboards)
    listeners = list(registry._listeners)
    yield
    registry._dashboards.clear()
    registry._dashboards.update(saved)
    registry._listeners[:] = listeners

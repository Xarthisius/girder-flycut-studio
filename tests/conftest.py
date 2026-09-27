import pytest


@pytest.fixture(autouse=True)
def isolated_plugin_discovery(monkeypatch):
    """Keep unrelated installed plugins out of this plugin's test server."""
    from girder_dashboards import registry
    from pytest_girder.plugin_registry import PluginRegistry
    entries = PluginRegistry._listPluginEntryPoints
    monkeypatch.setattr(PluginRegistry, "_listPluginEntryPoints", lambda self, *args, **kwargs: [ep for ep in entries(self, *args, **kwargs) if ep.name in {"flycut", "dashboards", "jsonforms"}])
    saved = dict(registry._dashboards)
    listeners = list(registry._listeners)
    yield
    registry._dashboards.clear()
    registry._dashboards.update(saved)
    registry._listeners[:] = listeners

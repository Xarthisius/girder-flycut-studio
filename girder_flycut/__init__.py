"""Girder integration for the Flyer configuration builder."""
from pathlib import Path

from girder.plugin import GirderPlugin, getPlugin, registerPluginStaticContent

KEY = "flycut-config"


class FlycutPlugin(GirderPlugin):
    DISPLAY_NAME = "Flyer Studio"

    def load(self, info):
        from girder_dashboards import registerDashboard
        from .rest import Flycut
        from .settings import DEFAULTS, validate_dashboard
        from girder import events
        events.bind('model.dashboard.save', 'flycut.settings', validate_dashboard)

        getPlugin("dashboards").load(info)
        registerDashboard(
            KEY, name="Flyer Studio",
            description="Configure flyer stacks, generate LightBurn files, and register stack IGSNs.",
            icon="icon-cog", settings=DEFAULTS,
        )
        from girder_dashboards.models.dashboard import Dashboard
        existing = Dashboard().findOne({'key': KEY, 'name': 'Flyer Config Studio'})
        if existing:
            existing['name'] = 'Flyer Studio'
            Dashboard().save(existing)
        info["apiRoot"].flycut = Flycut()
        registerPluginStaticContent(
            plugin="flycut", css=[], js=["/main.js"],
            staticDir=Path(__file__).parent / "web_client", tree=info["serverRoot"],
        )

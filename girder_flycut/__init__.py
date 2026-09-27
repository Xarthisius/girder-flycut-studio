"""Girder integration for the Flyer configuration builder."""
import logging
from pathlib import Path

from girder.plugin import GirderPlugin, getPlugin, registerPluginStaticContent

KEY = "flycut-config"

logger = logging.getLogger(__name__)


class FlycutPlugin(GirderPlugin):
    DISPLAY_NAME = "Flyer Studio"

    def load(self, info):
        from girder import events
        from girder_dashboards import registerDashboard

        from .rest import Flycut, ensure_lock_expiry
        from .settings import DEFAULTS, validate_dashboard
        events.bind('model.dashboard.save', 'flycut.settings', validate_dashboard)

        getPlugin("dashboards").load(info)
        registerDashboard(
            KEY, name="Flyer Studio",
            description="Configure flyer stacks, generate LightBurn files, and register stack IGSNs.",
            icon="icon-cog", settings=DEFAULTS,
        )
        self._renameLegacyDashboard()
        # Neither of these may abort the load: a plugin that refuses to import
        # takes the whole Girder server with it, and everything below is a
        # convenience rather than a precondition for serving requests.
        self._guard('could not add the stack-lock TTL index', ensure_lock_expiry)
        info["apiRoot"].flycut = Flycut()
        registerPluginStaticContent(
            plugin="flycut", css=[], js=["/main.js"],
            staticDir=Path(__file__).parent / "web_client", tree=info["serverRoot"],
        )

    @staticmethod
    def _guard(message, action):
        try:
            action()
        except Exception:
            logger.exception('flycut: %s', message)

    @classmethod
    def _renameLegacyDashboard(cls):
        """Carry pre-1.0 documents over to the current dashboard name.

        Saving the document fires `model.dashboard.save`, which runs this
        plugin's settings validator -- so a deployment whose stored settings
        have since stopped validating (a deleted creator group is enough) would
        raise ValidationException here and take the whole server down at
        startup. A failed rename is cosmetic; refusing to boot is not.
        """
        from girder_dashboards.models.dashboard import Dashboard

        def rename():
            existing = Dashboard().findOne({'key': KEY, 'name': 'Flyer Config Studio'})
            if existing:
                existing['name'] = 'Flyer Studio'
                Dashboard().save(existing)

        cls._guard('could not rename the legacy dashboard document', rename)

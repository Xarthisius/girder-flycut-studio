"""The Flyer Studio REST resource.

One `Resource` composed from four route mixins rather than one 686-line class:
`SettingsRoutes` (administrative policy), `TemplateRoutes` (which template and
what is in it), `ConfigRoutes` (listing, stack IDs, saving) and
`LifecycleRoutes` (generate, delete files, register).
"""

from girder.api.rest import Resource
from girder.constants import AccessType
from girder.exceptions import RestException
from girder_dashboards.models.dashboard import Dashboard

from .. import KEY
from .config import ConfigRoutes
from .lifecycle import LifecycleRoutes
from .settings import SettingsRoutes
from .template import TemplateRoutes

__all__ = ["Flycut"]


class Flycut(SettingsRoutes, TemplateRoutes, ConfigRoutes, LifecycleRoutes, Resource):
    def __init__(self):
        super().__init__()
        self.resourceName = "flycut"
        self.route("GET", ("settings",), self.get_settings)
        self.route("PUT", ("settings",), self.save_settings)
        self.route("GET", ("settings", "principals"), self.settings_principals)
        self.route("GET", ("settings", "workspace"), self.settings_workspace)
        self.route("GET", ("options",), self.options)
        self.route("GET", ("templates", ":id"), self.template)
        self.route("GET", ("template-item", ":id"), self.template_item)
        self.route("POST", ("import-laser-params",), self.import_excel)
        self.route("GET", ("config",), self.configs)
        self.route("GET", ("submitted-stacks",), self.submitted_stacks)
        self.route("GET", ("stack-states",), self.stack_states)
        self.route("GET", ("next-stack-id",), self.next_stack_id)
        self.route("POST", ("config",), self.save_config)
        self.route("DELETE", ("config", ":id"), self.delete_draft)
        self.route("POST", ("config", ":id", "generate"), self.generate_config)
        self.route("POST", ("config", ":id", "register"), self.register_config)
        self.route("DELETE", ("config", ":id", "files"), self.delete_files)

    def gate(self):
        user = self.getCurrentUser()
        doc = Dashboard().findOne({"key": KEY})
        if not doc or not doc.get("enabled") or not Dashboard().hasAccess(doc, user, AccessType.READ):
            raise RestException("This dashboard is disabled or inaccessible.", code=403)
        return user

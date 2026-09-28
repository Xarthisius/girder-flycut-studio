"""Template resolution, the LightBurn item picker, and the Excel import."""

import base64
import io
import xml.etree.ElementTree as ET
import zipfile

from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.item import Item

from ..excel import read_laser_excel
from ..import_storage import store_workbook
from ..materials import foil_materials
from ..portal_templates import load_portal_template
from ..schema import unpack
from .catalog import CATALOG
from .gate import gated


class TemplateRoutes:
    """Everything that answers "which template, and what is in it"."""

    @access.user
    @autoDescribeRoute(Description("Template layout.").param("id", "Template name", paramType="path"))
    @gated
    def template(self, id, user):
        if id.startswith("girder:"):
            return self.portal_template(id, user)[0]
        if id not in CATALOG["details"]:
            raise RestException("Template not found.", code=404)
        return CATALOG["details"][id]

    def portal_template(self, id, user):
        try:
            return load_portal_template(id, user)
        except (ValueError, KeyError, TypeError, ET.ParseError) as exc:
            raise RestException(str(exc)) from exc

    def catalog_for(self, config, user):
        catalog = {**CATALOG, "materials": foil_materials(user)}
        template = unpack(config).get("run_params", {}).get("template", "")
        if not isinstance(template, str) or not template.startswith("girder:"):
            return catalog
        detail = self.portal_template(template, user)[0]
        return {
            **catalog,
            "templates": [*CATALOG["templates"], detail],
            "details": {**CATALOG["details"], template: detail},
        }

    @access.user
    @autoDescribeRoute(
        Description("Choose a LightBurn file from a portal item.")
        .modelParam("id", "Item ID", model=Item, level=AccessType.READ, paramType="path")
        .param("filename", "Optional exact filename", default="")
    )
    @gated
    def template_item(self, item, filename="", user=None):
        files = [
            f
            for f in File().find({"itemId": item["_id"]})
            if f["name"].lower().endswith(".lbrn2") and (not filename or f["name"] == filename)
        ]
        if len(files) != 1:
            raise RestException(
                "Select an item containing a LightBurn file. If it contains several, enter the exact filename."
            )
        return self.portal_template("girder:" + str(files[0]["_id"]), user)[0]

    @access.user
    @autoDescribeRoute(
        Description("Import Excel laser parameters.").jsonParam("payload", "Base64 workbook", requireObject=True)
    )
    @gated
    def import_excel(self, payload):
        try:
            encoded = payload.get("data", "")
            if not isinstance(encoded, str) or len(encoded) > 7 * 1024 * 1024:
                raise ValueError("Workbook exceeds 5 MB.")
            data = base64.b64decode(encoded, validate=True)
            if not data or len(data) > 5 * 1024 * 1024:
                raise ValueError("Workbook must be between 1 byte and 5 MB.")
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if sum(i.file_size for i in archive.infolist()) > 30 * 1024 * 1024:
                    raise ValueError("Expanded workbook exceeds 30 MB.")
            rows = read_laser_excel(data)
            reference = store_workbook(data, payload.get("filename", "workbook.xlsx"), self.getCurrentUser())
            return {"filename": reference["name"], "reference": reference, "laser_params": rows}
        except (ValueError, TypeError, KeyError, IndexError, zipfile.BadZipFile, ET.ParseError) as exc:
            raise RestException(str(exc)) from exc

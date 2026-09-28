"""Foil choices from readable JSONForms depositions, not packaged file listings."""

from girder.constants import AccessType
from girder.exceptions import RestException
from girder_jsonforms.models.deposition import Deposition

from .settings import policy


def foil_materials(user):

    model = Deposition()
    # JSONForms represents local_id as a DataCite Local alternateIdentifier.
    query = {
        "$or": [
            {"metadata.local_id": {"$regex": "foil-?igsn", "$options": "i"}},
            {"local_id": {"$regex": "foil-?igsn", "$options": "i"}},
            {
                "metadata.alternateIdentifiers": {
                    "$elemMatch": {
                        "alternateIdentifierType": {"$regex": "^local$", "$options": "i"},
                        "alternateIdentifier": {"$regex": "foil-?igsn", "$options": "i"},
                    }
                }
            },
        ]
    }
    defaults = policy()["laser_defaults"]
    result = []
    for doc in model.find(query):
        if not model.hasAccess(doc, user, AccessType.READ):
            continue
        metadata = doc.get("metadata", {})
        material = {"thickness_um": metadata.get("thickness_um")}
        local_id = metadata.get("local_id") or doc.get("local_id") or model.local_identifier(metadata) or ""
        title = next((entry["title"] for entry in metadata.get("titles", []) if entry.get("title")), doc["igsn"])
        material.update({"igsn": doc["igsn"], "local_id": local_id, "name": title, "link": "#igsn/" + doc["igsn"]})
        result.append(
            {
                **material,
                "id": doc["igsn"],
                "label": f"{title} · {doc['igsn']}",
                "depositionId": str(doc["_id"]),
                "laser_defaults": defaults,
            }
        )
    return sorted(result, key=lambda entry: (entry["label"].lower(), entry["id"]))


def resolve_material(identifier, user):
    material = next((entry for entry in foil_materials(user) if identifier == entry["id"]), None)
    if material is None:
        raise RestException("Choose an accessible foil IGSN whose local identifier contains foil-igsn.", code=400)
    return material

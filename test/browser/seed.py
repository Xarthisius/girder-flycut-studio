#!/usr/bin/env python3
"""Put a Girder instance into the state the browser harness expects.

Pure REST over the stdlib, so it runs against a `girder serve` in CI and against
a live deployment on a developer's machine without needing database access or
any of the plugin's Python importable.

Idempotent and namespaced: everything it creates is named "Flyer Studio E2E" or
lives underneath it, so a repeat run is a no-op and the footprint on a shared
dev instance is one obviously-labelled collection.

Environment:
    GIRDER_URL       default http://127.0.0.1:8989
    GIRDER_ADMIN     default admin
    GIRDER_PASSWORD  default adminpassword
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("GIRDER_URL", "http://127.0.0.1:8989").rstrip("/")
ADMIN = os.environ.get("GIRDER_ADMIN", "admin")
PASSWORD = os.environ.get("GIRDER_PASSWORD", "adminpassword")

COLLECTION = "Flyer Studio E2E"
WORKSPACE = "Workspace"
FOIL_TITLE = "E2E aluminium foil"
DOI_PREFIX = "10.5072"     # DataCite's reserved test prefix, for local allocation
# The IGSN prefix is structured, not arbitrary: institution (2) + lab (1) +
# material (2) + subcategory (1), validated against jsonforms' vocabularies.
# JHAMAB is Johns Hopkins / HEMI / metals and alloys, the same value the
# plugin's pytest fixtures use.
IGSN_PREFIX = "JHAMAB"

TOKEN = None


def call(method, path, params=None, body=None, raw=False):
    url = f"{BASE}/api/v1/{path.lstrip('/')}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    headers = {"Accept": "application/json"}
    if TOKEN:
        headers["Girder-Token"] = TOKEN
    if body is not None:
        data = urllib.parse.urlencode(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"seed: {method} {path} -> {exc.code}\n  {detail}") from exc
    return payload if raw else (json.loads(payload) if payload else None)


def login():
    global TOKEN
    credentials = base64.b64encode(f"{ADMIN}:{PASSWORD}".encode()).decode()
    url = f"{BASE}/api/v1/user/authentication"
    request = urllib.request.Request(url, headers={"Authorization": f"Basic {credentials}"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            TOKEN = json.loads(response.read())["authToken"]["token"]
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"seed: admin login as {ADMIN!r} failed: {exc.code}") from exc
    return TOKEN


def setting(key, value):
    """Set a system setting only when it differs, so a shared instance is left alone."""
    current = call("GET", "system/setting", {"key": key})
    if current == value:
        return False
    call("PUT", "system/setting", body={"key": key, "value": json.dumps(value)})
    return True


def find_or_create_collection(name):
    for entry in call("GET", "collection", {"text": name, "limit": 50}) or []:
        if entry["name"] == name:
            return entry
    return call("POST", "collection", body={"name": name, "public": "true"})


def find_or_create_folder(parent_id, name):
    existing = call("GET", "folder", {
        "parentType": "collection", "parentId": parent_id, "name": name, "limit": 1})
    if existing:
        return existing[0]
    return call("POST", "folder", body={
        "parentType": "collection", "parentId": parent_id, "name": name, "public": "true"})


def find_or_create_foil():
    """A deposition carrying `foil-igsn`, which is how the plugin finds materials."""
    # The list endpoint nests the DataCite fields under `metadata`; they are not
    # top-level as they are on the document the create call returns.
    for entry in call("GET", "deposition", {"limit": 100}) or []:
        meta = entry.get("metadata") or {}
        titles = meta.get("titles") or [{}]
        alternates = meta.get("alternateIdentifiers") or []
        if titles[0].get("title") == FOIL_TITLE and any(
                alt.get("alternateIdentifier") == "foil-igsn" for alt in alternates):
            return entry
    metadata = {
        "titles": [{"title": FOIL_TITLE}],
        "creators": [{"name": "Flyer Studio E2E", "nameType": "Organizational"}],
        "publisher": {"name": "Flyer Studio E2E"},
        "publicationYear": "2026",
        "relatedIdentifiers": [],
        "alternateIdentifiers": [
            {"alternateIdentifier": "foil-igsn", "alternateIdentifierType": "Local"},
        ],
    }
    return call("POST", "deposition", body={
        "metadata": json.dumps(metadata), "prefix": IGSN_PREFIX, "track": "false"})


def main():
    login()
    print(f"seed: {BASE} as {ADMIN}")

    # Registration allocates identifiers from a local counter when no IGSN
    # service is configured; the prefix is what it counts under.
    if setting("jsonforms.igsn_prefix", DOI_PREFIX):
        print(f"  set jsonforms.igsn_prefix = {DOI_PREFIX}")

    # Flyer Studio runs inside Girder as the signed-in user and never talks to
    # the AIMD portal. See docs/JSONFORMS_COMPATIBILITY.md.
    if setting("jsonforms.projects_enabled", False):
        print("  set jsonforms.projects_enabled = False")

    collection = find_or_create_collection(COLLECTION)
    workspace = find_or_create_folder(collection["_id"], WORKSPACE)
    print(f"  collection {collection['_id']} / folder {workspace['_id']}")

    # A foil is what makes the material dropdown non-empty. If the instance
    # cannot mint one -- no broker for the deposition.created handler, say --
    # keep going: verify.cjs skips the checks that need a material rather than
    # losing the whole rendering walk to it.
    try:
        foil = find_or_create_foil()
        print(f"  foil deposition {foil['_id']} ({foil.get('igsn') or 'no igsn'})")
    except SystemExit as exc:
        print(f"  WARNING: no foil material seeded: {exc}")

    dashboards = call("GET", "dashboard", {"includeDisabled": "true"}) or []
    flycut = next((d for d in dashboards if d["key"] == "flycut-config"), None)
    if not flycut:
        raise SystemExit(
            "seed: the flycut-config dashboard is not registered. Is the plugin loaded?")

    settings = {
        "workspace_folder_id": workspace["_id"],
        "workspace_path": f"/collection/{COLLECTION}/{WORKSPACE}",
        "creators_include_user": True,
        "owners_include_user": True,
        "editors_include_user": True,
        "public_igsn": False,
        "public_files": False,
    }
    call("PUT", f"dashboard/{flycut['_id']}", body={
        "settings": json.dumps(settings), "enabled": "true"})
    print(f"  dashboard {flycut['_id']} enabled, workspace configured")

    print(json.dumps({"dashboardId": flycut["_id"],
                      "workspaceFolderId": workspace["_id"],
                      "collectionId": collection["_id"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

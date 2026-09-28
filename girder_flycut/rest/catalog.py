"""The packaged template catalog, read once."""

import json
from pathlib import Path

CATALOG = json.loads((Path(__file__).parent.parent / "catalog.json").read_text())

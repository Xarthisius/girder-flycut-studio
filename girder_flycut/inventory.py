"""Update inventory lifecycle in the CSV itself, preserving its Girder file ID."""

import csv
import io

from girder.models.file import File
from girder.models.upload import Upload
from girder.utility import RequestBodyStream


def register_inventory(item, user, now=None):
    for file in File().find({"itemId": item["_id"]}):
        if not file["name"].endswith("-inventory.csv"):
            continue
        with File().open(file) as stream:
            reader = csv.DictReader(io.StringIO(stream.read().decode("utf-8")))
            fields = reader.fieldnames
            rows = list(reader)
        if not fields or "status" not in fields:
            raise ValueError("Inventory CSV has no status column.")
        if all(row["status"] == "registered" for row in rows):
            continue
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            row["status"] = "registered"
            if "time_registered" in fields:
                row["time_registered"] = now or ""
            writer.writerow(row)
        data = output.getvalue().encode("utf-8")
        model = Upload()
        upload = model.createUploadToFile(file, user, len(data))
        model.handleChunk(upload, RequestBodyStream(io.BytesIO(data), len(data)))

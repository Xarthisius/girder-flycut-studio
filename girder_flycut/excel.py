import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO


def _excel_cell_value(cell: ET.Element, shared_strings: list[str], ns: dict[str, str]):
    cell_type = cell.get("t")
    value_node = cell.find("x:v", ns)
    if value_node is None:
        inline = cell.find("x:is/x:t", ns)
        return inline.text if inline is not None else None
    raw = value_node.text or ""
    if cell_type == "s":
        return shared_strings[int(raw)]
    if cell_type in {"str", "inlineStr"}:
        return raw
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def read_laser_excel(payload: bytes) -> list[dict]:
    """Read the first worksheet of an .xlsx file using only the standard library."""
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = ["".join(node.itertext()) for node in root.findall("x:si", ns)]
        sheet_names = sorted(
            name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        )
        if not sheet_names:
            raise ValueError("The workbook has no worksheets.")
        root = ET.fromstring(archive.read(sheet_names[0]))
        rows: list[list[object]] = []
        for row in root.findall(".//x:sheetData/x:row", ns):
            values: list[object] = []
            for cell in row.findall("x:c", ns):
                ref = cell.get("r", "A1")
                letters = "".join(char for char in ref if char.isalpha())
                column = 0
                for char in letters:
                    column = column * 26 + ord(char.upper()) - 64
                while len(values) < column - 1:
                    values.append(None)
                values.append(_excel_cell_value(cell, shared_strings, ns))
            rows.append(values)
    if not rows:
        raise ValueError("The first worksheet is empty.")
    headers = [str(value or "").strip().lower() for value in rows[0]]
    aliases = {
        "maxpower": "power",
        "power": "power",
        "qpulsewidth": "qpulsewidth",
        "speed": "speed",
        "frequency": "frequency",
        "numpasses": "passes",
        "passes": "passes",
    }
    positions = {aliases[header]: index for index, header in enumerate(headers) if header in aliases}
    required = {"power", "qpulsewidth", "speed", "frequency", "passes"}
    missing = sorted(required - positions.keys())
    if missing:
        raise ValueError(f"Missing Excel columns: {', '.join(missing)}")
    result = []
    for row in rows[1:]:
        if not any(value not in (None, "") for value in row):
            continue
        try:
            result.append({key: row[index] for key, index in positions.items()})
        except IndexError as exc:
            raise ValueError("An Excel row is missing one or more laser values.") from exc
        if len(result) == 28:
            break
    if not result:
        raise ValueError("The workbook contains no laser parameter rows.")
    return result

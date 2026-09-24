"""Resolve portal templates through Girder's permission-checked file models."""
from pathlib import Path
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET

from girder.constants import AccessType
from girder.models.file import File
from girder.models.item import Item

from .template_identity import id_cut, resolve_template

INPUTS = Path(__file__).parent / 'inputs' / 'templates'


def read_file(file, limit):
    if file.get('size', 0) > limit:
        raise ValueError('Template file is too large.')
    with File().open(file) as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Template file is too large.')
    return data


def load_portal_template(identifier, user):
    file = File().load(identifier.removeprefix('girder:'), user=user, level=AccessType.READ, exc=True)
    name = file['name']
    if Path(name).name != name or not name.lower().endswith('.lbrn2'):
        raise ValueError('Select a LightBurn .lbrn2 file.')
    data = read_file(file, 10 * 1024 * 1024)
    root = ET.fromstring(data)
    cut = id_cut(root)
    subname = cut.find('subname') if cut is not None else None
    original = subname.get('Value', '') if subname is not None else ''
    if original and not original.lower().endswith('.lbrn2'):
        import json
        matches = [json.loads(p.read_text()) for p in INPUTS.glob('*.json')]
        match = next((entry for entry in matches if entry.get('template_id') == original), None)
        original = match['template'] if match else name
    else:
        original = original or name
    if Path(original).name != original:
        raise ValueError('Template identity must be a filename.')
    sidecar_name = str(Path(original).with_suffix('.json'))
    # Sidecars may share the selected item, or be a sibling item in the same folder.
    item = Item().load(file['itemId'], user=user, level=AccessType.READ, exc=True)
    candidates = list(File().find({'itemId': item['_id'], 'name': sidecar_name}, limit=2))
    if not candidates:
        sibling = Item().findOne({'folderId': item['folderId'], 'name': sidecar_name})
        if sibling:
            Item().requireAccess(sibling, user=user, level=AccessType.READ)
            candidates = list(File().find({'itemId': sibling['_id'], 'name': sidecar_name}, limit=2))
    if len(candidates) > 1:
        raise ValueError('More than one matching template metadata file was found.')
    with TemporaryDirectory(prefix='flycut-template-') as directory:
        path = Path(directory) / name
        path.write_bytes(data)
        if candidates:
            sidecar_file = File().load(candidates[0]['_id'], user=user, level=AccessType.READ, exc=True)
            (path.parent / sidecar_name).write_bytes(read_file(sidecar_file, 2 * 1024 * 1024))
        try:
            _, sidecar = resolve_template(path, [INPUTS])
        except FileNotFoundError as exc:
            raise ValueError('This template needs its matching JSON layout file in the same portal item or folder.') from exc
    flyers = sidecar.get('physical_flyers')
    if not isinstance(flyers, list) or not flyers or len(flyers) > 10000:
        raise ValueError('Template metadata must describe 1–10,000 physical flyers.')
    layers = list(dict.fromkeys(str(f['layer']) for f in flyers))
    for flyer in flyers:
        float(flyer['xpos'])
        float(flyer['ypos'])
    detail = {'id': 'girder:' + str(file['_id']), 'label': name, 'source': 'Portal',
              'layers': layers, 'flyers': flyers, 'layer_count': len(layers), 'flyer_count': len(flyers)}
    return detail, root, sidecar

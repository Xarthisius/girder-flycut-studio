"""Validated dashboard policy; Girder IDs remain stable across renames."""
import copy
from bson import ObjectId
from girder.constants import AccessType
from girder.exceptions import ValidationException, RestException
from girder.models.folder import Folder
from girder.models.user import User
from girder.models.group import Group
from girder_dashboards.models.dashboard import Dashboard
from girder.utility.path import lookUpPath, getResourcePath
from . import KEY

DEFAULTS = dict(creators=[], creators_include_user=True, owners=[], editors=[], viewers=[],
                owners_include_user=False, editors_include_user=True, viewers_include_user=False,
                public_igsn=False, public_files=False, workspace_path='', workspace_folder_id='',
                laser_defaults={'maxPower': 60, 'speed': 100, 'QPulseWidth': 200, 'frequency': 100, 'numPasses': 1})


def policy():
    doc = Dashboard().findOne({'key': KEY})
    return {**copy.deepcopy(DEFAULTS), **(doc or {}).get('settings', {})}


def validate_settings(settings):
    result = {**copy.deepcopy(DEFAULTS), **settings}
    import math
    defaults = result['laser_defaults']
    if not isinstance(defaults, dict) or set(defaults) != {'maxPower', 'speed', 'QPulseWidth', 'frequency', 'numPasses'}:
        raise ValidationException('laser_defaults must contain maxPower, speed, QPulseWidth, frequency, and numPasses.')
    if any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in defaults.values()) or defaults['maxPower'] > 100 or defaults['speed'] <= 0 or defaults['numPasses'] < 1 or defaults['numPasses'] != int(defaults['numPasses']):
        raise ValidationException('Invalid laser_defaults: use finite positive speed, power 0–100, nonnegative values, and integer passes >= 1.')
    for key in ('creators_include_user', 'owners_include_user', 'editors_include_user', 'viewers_include_user', 'public_igsn', 'public_files'):
        if type(result[key]) is not bool:
            raise ValidationException(f'{key} must be a boolean.')
    for key in ('creators', 'owners', 'editors', 'viewers'):
        entries = result[key]
        if not isinstance(entries, list):
            raise ValidationException(f'{key} must be a list of users/groups.')
        normalized = []
        for entry in entries:
            if not isinstance(entry, dict) or entry.get('type') not in ('user', 'group') or not ObjectId.is_valid(entry.get('id', '')):
                raise ValidationException(f'{key}: select a valid user or group.')
            model = User() if entry['type'] == 'user' else Group()
            entity = model.load(entry['id'], force=True)
            if not entity:
                raise ValidationException(f'{key}: user/group no longer exists.')
            ref = {'type': entry['type'], 'id': str(entity['_id'])}
            if ref not in normalized:
                normalized.append(ref)
        result[key] = normalized
    if not result['creators'] and not result['creators_include_user']:
        raise ValidationException('Configure an IGSN creator or include the registrant.')
    destination = result.get('workspace_folder_id')
    path = result.get('workspace_path')
    if not isinstance(path, str) or not isinstance(destination, str):
        raise ValidationException('Workspace must be a folder path or ID.')
    folder = None
    if destination:
        if not ObjectId.is_valid(destination):
            raise ValidationException('Invalid workspace folder ID.')
        folder = Folder().load(destination, force=True)
    elif path.strip():
        try:
            resource = lookUpPath(path.strip(), force=True)
        except Exception as exc:
            raise ValidationException('Workspace path does not identify an existing collection folder.') from exc
        if resource and resource['model'] == 'folder':
            folder = resource['document']
    if destination or path.strip():
        if not folder or folder.get('baseParentType') != 'collection':
            raise ValidationException('Select a folder inside a Girder collection for the workspace.')
        if not result['owners'] and not result['owners_include_user']:
            raise ValidationException('Configure an owner user/group, or include the acting user as owner.')
        result['workspace_folder_id'] = str(folder['_id'])
        result['workspace_path'] = getResourcePath('folder', folder, force=True)
    return result


def validate_dashboard(event):
    doc = event.info
    if doc.get('key') == KEY:
        doc['settings'] = validate_settings(doc.get('settings', {}))


def workspace(user, write=False):
    identifier = policy()['workspace_folder_id']
    if not identifier:
        if write:
            raise RestException('An administrator must configure the Flyer Studio workspace first.', code=409)
        return None
    return Folder().load(identifier, user=user, level=AccessType.WRITE if write else AccessType.READ, exc=True)


def access_list(settings, actor):
    levels = {'users': {}, 'groups': {}}
    for role, level in [('viewers', AccessType.READ), ('editors', AccessType.WRITE), ('owners', AccessType.ADMIN)]:
        entries = list(settings[role])
        if settings[role + '_include_user']:
            entries.append({'type': 'user', 'id': str(actor['_id'])})
        for entry in entries:
            bucket = levels['users' if entry['type'] == 'user' else 'groups']
            bucket[entry['id']] = max(level, bucket.get(entry['id'], -1))
    return {kind: [{'id': ObjectId(identifier), 'level': level} for identifier, level in entries.items()] for kind, entries in levels.items()}


def apply_access(model, doc, settings, actor, igsn=False):
    model.setAccessList(doc, access_list(settings, actor), user=actor, save=False)
    model.setPublic(doc, settings['public_igsn' if igsn else 'public_files'], save=False)
    doc['publicFlags'] = []
    return model.save(doc)


def creators(settings, actor):
    entries = list(settings['creators'])
    if settings['creators_include_user']:
        entries.append({'type': 'user', 'id': str(actor['_id'])})
    result, seen = [], set()
    for entry in entries:
        key = (entry['type'], entry['id'])
        if key in seen:
            continue
        seen.add(key)
        entity = (User() if entry['type'] == 'user' else Group()).load(entry['id'], force=True, exc=True)
        if entry['type'] == 'group':
            result.append({'name': entity['name'], 'nameType': 'Organizational'})
        else:
            result.append({'name': (entity.get('firstName', '') + ' ' + entity.get('lastName', '')).strip() or entity['login'],
                           'nameType': 'Personal', 'givenName': entity.get('firstName', ''), 'familyName': entity.get('lastName', '')})
    if not result:
        raise RestException('Configure at least one IGSN creator or enable creators_include_user.', code=409)
    return result

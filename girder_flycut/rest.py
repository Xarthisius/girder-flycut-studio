"""Authenticated Girder model-backed configuration, generation and registration."""
import base64
from bson import ObjectId
from functools import wraps
from pymongo.errors import DuplicateKeyError
import copy
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.upload import Upload
from girder_dashboards.models.dashboard import Dashboard

from .portal_templates import load_portal_template
from . import KEY
from .schema import pack, unpack
from .validation import normalize_config, normalize_builder_config
from .generate import generate
from .materials import foil_materials, resolve_material
from .registration import is_test_run, stack_metadata, foil_identifiers
from . import settings as studio_settings
from .storage import draft_root, promote, remove_config
from .excel import read_laser_excel
from .import_storage import store_workbook, load_input, link_input
from .artifacts import configuration, CONFIG_QUERY, save_config_file, association, annotate, register_metadata

CATALOG = json.loads((Path(__file__).parent / 'catalog.json').read_text())


# How long a stack may stay locked before Mongo reclaims it. Generation is
# synchronous, so a legitimate operation finishes far inside this; the window
# only has to be wider than the slowest honest request.
STACK_LOCK_TTL_SECONDS = 900

LOCK_COLLECTION = 'flycut_stack_locks'


def stack_locks():
    """The stack mutex collection."""
    return Item().collection.database[LOCK_COLLECTION]


def ensure_lock_expiry():
    """Give the stack mutex a TTL so a crashed worker cannot wedge a stack.

    Without this, a process that dies between insert_one and delete_one leaves
    the lock document behind and every later request for that stack ID answers
    409 forever, with no operator-visible way to clear it.

    Documents written before this index existed carry no `acquired` field and
    are therefore never expired by it -- drop them by hand if any are stuck.
    """
    stack_locks().create_index('acquired', expireAfterSeconds=STACK_LOCK_TTL_SECONDS)


def stack_locked(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        if method.__name__ == 'save_config':
            if not kwargs.get('submit', False):
                return method(self, *args, **kwargs)
            raw = kwargs.get('config', args[0] if args else {})
        else:
            identifier = kwargs.get('id', args[0] if args else '')
            raw = configuration(self.config_item(identifier, self.gate()))
        stack = str(unpack(raw).get('run_params', {}).get('stackid', '')).strip().upper()
        locks = stack_locks()
        try:
            locks.insert_one({'_id': stack, 'acquired': datetime.now(timezone.utc)})
        except DuplicateKeyError:
            raise RestException('This stack is being changed. Try again when that operation finishes.', code=409)
        try:
            return method(self, *args, **kwargs)
        finally:
            locks.delete_one({'_id': stack})
    return wrapped


class Flycut(Resource):
    def __init__(self):
        super().__init__()
        self.resourceName = 'flycut'
        self.route('GET', ('settings',), self.get_settings)
        self.route('PUT', ('settings',), self.save_settings)
        self.route('GET', ('settings', 'principals'), self.settings_principals)
        self.route('GET', ('settings', 'workspace'), self.settings_workspace)
        self.route('GET', ('options',), self.options)
        self.route('GET', ('templates', ':id'), self.template)
        self.route('GET', ('template-item', ':id'), self.template_item)
        self.route('POST', ('import-laser-params',), self.import_excel)
        self.route('GET', ('config',), self.configs)
        self.route('GET', ('submitted-stacks',), self.submitted_stacks)
        self.route('GET', ('stack-states',), self.stack_states)
        self.route('GET', ('next-stack-id',), self.next_stack_id)
        self.route('POST', ('config',), self.save_config)
        self.route('DELETE', ('config', ':id'), self.delete_draft)
        self.route('POST', ('config', ':id', 'generate'), self.generate_config)
        self.route('POST', ('config', ':id', 'register'), self.register_config)
        self.route('DELETE', ('config', ':id', 'files'), self.delete_files)

    def gate(self):
        user = self.getCurrentUser()
        doc = Dashboard().findOne({'key': KEY})
        if not doc or not doc.get('enabled') or not Dashboard().hasAccess(doc, user, AccessType.READ):
            raise RestException('This dashboard is disabled or inaccessible.', code=403)
        return user

    @access.admin
    @autoDescribeRoute(Description('Flyer Studio administrative policy.'))
    def get_settings(self):
        from girder.models.collection import Collection
        result = studio_settings.policy()
        if result['workspace_folder_id']:
            result = studio_settings.validate_settings(result)
        from girder.models.user import User
        from girder.models.group import Group
        for role in ('creators', 'owners', 'editors', 'viewers'):
            for ref in result[role]:
                entity = (User() if ref['type'] == 'user' else Group()).load(ref['id'], force=True)
                ref['label'] = (entity.get('login') or entity.get('name')) if entity else ref['id']
        return {'workspaceCollectionId': str(Folder().load(result['workspace_folder_id'], force=True)['baseParentId']) if result['workspace_folder_id'] else None, 'settings': result, 'collections': [{'id': str(c['_id']), 'name': c['name']} for c in Collection().find()]}

    @access.admin
    @autoDescribeRoute(Description('Save Flyer Studio policy for new data.').jsonParam('settings', 'Settings', requireObject=True))
    def save_settings(self, settings):
        result = studio_settings.validate_settings(settings)
        doc = Dashboard().findOne({'key': KEY})
        doc['settings'] = result
        Dashboard().save(doc)
        return self.get_settings()

    @access.admin
    @autoDescribeRoute(Description('Find users and groups for dashboard policy.').param('q', 'Name search', default=''))
    def settings_principals(self, q):
        import re
        from girder.models.user import User
        from girder.models.group import Group
        pattern = {'$regex': re.escape(q.strip()), '$options': 'i'}
        users = User().find({'$or': [{'login': pattern}, {'firstName': pattern}, {'lastName': pattern}]}, limit=100)
        groups = Group().find({'name': pattern}, limit=100)
        return ([{'type': 'user', 'id': str(u['_id']), 'label': u['login'] + ' — ' + u.get('firstName', '') + ' ' + u.get('lastName', '')} for u in users] +
                [{'type': 'group', 'id': str(g['_id']), 'label': g['name']} for g in groups])

    @access.admin
    @autoDescribeRoute(Description('Resolve a collection folder.').param('id', 'Folder ID'))
    def settings_workspace(self, id):
        from girder.utility.path import getResourcePath
        folder = Folder().load(id, user=self.getCurrentUser(), level=AccessType.ADMIN, exc=True)
        if folder.get('baseParentType') != 'collection':
            raise RestException('Choose a folder inside a collection.')
        return {'id': str(folder['_id']), 'path': getResourcePath('folder', folder, force=True)}

    def workspace(self, user, create=False):
        return studio_settings.workspace(user, write=create)

    def in_workspace(self, item):
        workspace_id = studio_settings.policy()['workspace_folder_id']
        folder = Folder().load(item['folderId'], force=True)
        if not workspace_id or not folder:
            return False
        if str(folder['_id']) == workspace_id:
            return True
        if item.get('meta', {}).get('flycut', {}).get('workspaceId') != workspace_id or folder.get('parentCollection') != 'folder':
            return False
        if str(folder['parentId']) == workspace_id:
            return True
        parent = Folder().load(folder['parentId'], force=True)
        return bool(parent and str(parent.get('parentId')) == workspace_id and
                    parent.get('meta', {}).get('flycutDraftsWorkspace') == workspace_id)


    def config_item(self, id, user):
        item = Item().load(id, user=user, level=AccessType.WRITE, exc=True)
        if 'flycut' not in item.get('meta', {}) or not self.in_workspace(item):
            raise RestException('Not a configuration in this Flyer Studio workspace.', code=403)
        return item

    def lifecycle(self, item):
        state = item['meta']['flycut']
        if state.get('registration') or state.get('status') == 'registered':
            return 'registered'
        if state.get('status') == 'draft':
            return 'draft'
        from bson import ObjectId
        if any(File().findOne({'_id': ObjectId(file['_id'])}) for file in state.get('files', [])):
            return 'generated'
        return 'submitted'

    def stack_matches(self, stack):
        return [item for item in Item().find({**CONFIG_QUERY, 'meta.flycut.status': {'$ne': 'draft'}})
                if str(unpack(configuration(item)).get('run_params', {}).get('stackid', '')).strip().upper() == stack.strip().upper()]

    @access.user
    @autoDescribeRoute(Description('Stack reuse rules for the current user.'))
    def stack_states(self):
        user = self.gate()
        result = {}
        for item in Item().find({**CONFIG_QUERY, 'meta.flycut.status': {'$ne': 'draft'}}):
            stack = str(unpack(configuration(item)).get('run_params', {}).get('stackid', '')).strip().upper()
            status = self.lifecycle(item)
            if (not self.in_workspace(item) or not Item().hasAccess(item, user, AccessType.WRITE)) and status == 'submitted':
                status = 'restricted'
            rank = {'submitted': 1, 'restricted': 2, 'generated': 3, 'registered': 4}
            if rank[status] > rank.get(result.get(stack), 0):
                result[stack] = status
        return result

    def serialize(self, item):
        timestamp = item.get('updated', item.get('created'))
        fallback = timestamp.replace(tzinfo=timezone.utc).isoformat() if timestamp else ''
        return {'_id': str(item['_id']), 'name': item['name'], 'savedAt': fallback, **item['meta']['flycut'], 'config': configuration(item), 'status': self.lifecycle(item), 'canEdit': Item().hasAccess(item, self.getCurrentUser(), AccessType.WRITE)}

    @access.user
    @autoDescribeRoute(Description('Configuration catalog and signed-in operator.'))
    def options(self):
        user = self.gate()
        return {'workspaceFolderId': studio_settings.policy()['workspace_folder_id'], 'materials': foil_materials(user), 'templates': CATALOG['templates'], 'presets': [], 'cache': {'operators': [user['login']], 'field_names': CATALOG['field_names']}}

    @access.user
    @autoDescribeRoute(Description('Template layout.').param('id', 'Template name', paramType='path'))
    def template(self, id):
        user = self.gate()
        if id.startswith('girder:'):
            return self.portal_template(id, user)[0]
        if id not in CATALOG['details']:
            raise RestException('Template not found.', code=404)
        return CATALOG['details'][id]

    def portal_template(self, id, user):
        try:
            return load_portal_template(id, user)
        except (ValueError, KeyError, TypeError, ET.ParseError) as exc:
            raise RestException(str(exc)) from exc

    def catalog_for(self, config, user):
        catalog = {**CATALOG, 'materials': foil_materials(user)}
        template = unpack(config).get('run_params', {}).get('template', '')
        if not isinstance(template, str) or not template.startswith('girder:'):
            return catalog
        detail = self.portal_template(template, user)[0]
        return {**catalog, 'templates': [*CATALOG['templates'], detail],
                'details': {**CATALOG['details'], template: detail}}

    @access.user
    @autoDescribeRoute(Description('Choose a LightBurn file from a portal item.')
        .param('id', 'Item ID', paramType='path')
        .param('filename', 'Optional exact filename', default=''))
    def template_item(self, id, filename=''):
        user = self.gate()
        item = Item().load(id, user=user, level=AccessType.READ, exc=True)
        files = [f for f in File().find({'itemId': item['_id']})
                 if f['name'].lower().endswith('.lbrn2') and (not filename or f['name'] == filename)]
        if len(files) != 1:
            raise RestException('Select an item containing a LightBurn file. If it contains several, enter the exact filename.')
        return self.portal_template('girder:' + str(files[0]['_id']), user)[0]

    @access.user
    @autoDescribeRoute(Description('Import Excel laser parameters.').jsonParam('payload', 'Base64 workbook', requireObject=True))
    def import_excel(self, payload):
        self.gate()
        try:
            encoded = payload.get('data', '')
            if not isinstance(encoded, str) or len(encoded) > 7 * 1024 * 1024:
                raise ValueError('Workbook exceeds 5 MB.')
            data = base64.b64decode(encoded, validate=True)
            if not data or len(data) > 5 * 1024 * 1024:
                raise ValueError('Workbook must be between 1 byte and 5 MB.')
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if sum(i.file_size for i in archive.infolist()) > 30 * 1024 * 1024:
                    raise ValueError('Expanded workbook exceeds 30 MB.')
            rows = read_laser_excel(data)
            reference = store_workbook(data, payload.get('filename', 'workbook.xlsx'), self.getCurrentUser())
            return {'filename': reference['name'], 'reference': reference, 'laser_params': rows}
        except (ValueError, TypeError, KeyError, IndexError, zipfile.BadZipFile, ET.ParseError) as exc:
            raise RestException(str(exc)) from exc

    @access.user
    @autoDescribeRoute(Description('List your latest 100 configurations.'))
    def configs(self):
        user = self.gate()
        workspace_id = studio_settings.policy()['workspace_folder_id']
        if not workspace_id:
            return []
        records = [self.serialize(i) for i in Item().find(CONFIG_QUERY)
                   if self.in_workspace(i) and Item().hasAccess(i, user, AccessType.READ)]
        return sorted(records, key=lambda record: str(record.get('savedAt') or ''), reverse=True)[:100]

    @access.user
    @autoDescribeRoute(Description('Stack IDs with one of your submitted configurations.'))
    def submitted_stacks(self):
        return self.submitted_stack_ids(self.gate())

    @access.user
    @autoDescribeRoute(Description('Lowest unused five-character Crockford stack ID.'))
    def next_stack_id(self):
        self.gate()
        used = {str(unpack(configuration(item)).get('run_params', {}).get('stackid', '')).strip().upper()
                for item in Item().find(CONFIG_QUERY)}
        alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
        for number in range(len(used) + 1):
            value = number
            candidate = ''
            for _ in range(5):
                candidate = alphabet[value % 32] + candidate
                value //= 32
            if value:
                break
            if candidate not in used:
                return {'stackid': candidate}
        raise RestException('No available Stack IDs remain.')

    def submitted_stack_ids(self, user):
        records = Item().find({**CONFIG_QUERY,
                               'meta.flycut.status': {'$ne': 'draft'}})
        return sorted({str(unpack(configuration(item)).get('run_params', {}).get('stackid', '')).strip()
                       for item in records if self.in_workspace(item) and Item().hasAccess(item, user, AccessType.READ)} - {''})

    @access.user
    @autoDescribeRoute(Description('Save an editable draft or submit a final configuration.')
        .jsonParam('config', 'Builder configuration', requireObject=True)
        .param('name', 'Saved configuration name', default='')
        .param('id', 'Existing draft ID', default='')
        .param('submit', 'Finalize the configuration', dataType='boolean', default=False)
        .param('validated', 'Acknowledge validation warnings', dataType='boolean', default=False))
    @stack_locked
    def save_config(self, config, name='', id='', submit=False, validated=False):
        user = self.gate()
        if len(json.dumps(config, allow_nan=False).encode()) > 256 * 1024:
            raise RestException('Configuration exceeds 256 KB.')
        rendered_config = copy.deepcopy(config) if 'run_parameters' in config else pack(config)
        rendered_config.pop('createdBy', None)
        rendered_config['preset'] = None
        existing = self.config_item(id, user) if id else None
        if existing and existing['meta']['flycut'].get('status') != 'draft':
            raise RestException('Submitted configurations cannot be edited. Make a copy.', code=409)
        try:
            if submit:
                from .validation import builder_warnings
                config = unpack(config)
                config['preset'] = None
                is_test_run(config)
                load_input(config, user)
                if isinstance(config.get('run_params'), dict):
                    config['run_params']['foil_material'] = resolve_material(config['run_params'].get('foil_material'), user)['id']
                catalog = self.catalog_for(config, user)
                warnings = builder_warnings(config, catalog)
                if str(config.get('run_params', {}).get('stackid', '')).strip() in self.submitted_stack_ids(user):
                    warnings.append('This Stack ID already has a submitted configuration.')
                config = normalize_builder_config(config, user, catalog)
                if warnings and not validated:
                    raise ValueError('Confirm validation warnings before submitting.')
            else:
                config = copy.deepcopy(config)
                config['createdBy'] = str(user['_id'])
        except (ValueError, TypeError) as exc:
            raise RestException(str(exc)) from exc
        name = name.strip()
        if len(name) > 160:
            raise RestException('Configuration name must be at most 160 characters.')
        stack = config.get('run_params', {}).get('stackid', '')
        name = f'stack{stack}-config' if submit else name or (f'stack{stack}-config' if stack else 'Untitled draft')
        state = {'status': 'submitted' if submit else 'draft',
                 'overwriteSafe': existing['meta']['flycut'].get('overwriteSafe', True) if existing else True, 'createdBy': str(user['_id']),
                 'savedAt': datetime.now(timezone.utc).isoformat(), 'workspaceId': studio_settings.policy()['workspace_folder_id']}
        if not submit:
            state['customFieldRows'] = config.get('custom_field_rows', [])
        if submit:
            state['submittedAt'] = state['savedAt']
            matches = self.stack_matches(stack)
            for match in matches:
                lifecycle = self.lifecycle(match)
                if lifecycle == 'registered':
                    raise RestException('This Stack ID is registered and cannot be reused.', code=409)
                if lifecycle == 'generated':
                    raise RestException('Delete the generated files before reusing this Stack ID.', code=409)
                if not self.in_workspace(match) or not Item().hasAccess(match, user, AccessType.WRITE):
                    raise RestException('This Stack ID belongs to another user.', code=409)
            if matches:
                if not validated:
                    raise RestException('Validate replacement of the submitted configuration.', code=409)
                state['overwriteSafe'] = False
                target = matches[0]
                promote(target, self.workspace(user, True), stack, user)
                Item().collection.update_one({'_id': target['_id']}, {'$set': {'name': name, 'meta.flycut': state, 'meta.config': rendered_config}})
                for duplicate in matches[1:]:
                    remove_config(duplicate, studio_settings.policy()['workspace_folder_id'])
                if existing and existing['_id'] != target['_id']:
                    remove_config(existing, studio_settings.policy()['workspace_folder_id'])
                return self.serialize(save_config_file(Item().load(target['_id'], force=True), user, rendered_config))
        if existing:
            if submit:
                promote(existing, self.workspace(user, True), stack, user)
            result = Item().collection.update_one({'_id': existing['_id'], 'meta.flycut.status': 'draft'},
                {'$set': {'name': name, 'meta.flycut': state, 'meta.config': rendered_config}})
            if not result.modified_count and not result.matched_count:
                raise RestException('This draft was already submitted.', code=409)
            item = Item().load(existing['_id'], force=True)
        else:
            workspace = self.workspace(user, True)
            parent = workspace if submit else draft_root(workspace, user)
            folder_name = 'stack' + stack if submit else 'draft-' + str(ObjectId())
            if submit and Folder().findOne({'parentId': workspace['_id'], 'parentCollection': 'folder', 'name': folder_name}):
                raise RestException('A folder for this stack already exists in the workspace.', code=409)
            folder = Folder().createFolder(parent, folder_name, creator=user, public=False)
            folder = studio_settings.apply_access(Folder(), folder, studio_settings.policy(), user)
            item = Item().createItem(name, creator=user, folder=folder)
            item = Item().setMetadata(item, {'flycut': state, 'config': copy.deepcopy(rendered_config)})
            if submit and item['name'] != name:
                Item().collection.update_one({'_id': item['_id']}, {'$set': {'name': name}})
                item['name'] = name
        return self.serialize(save_config_file(item, user, rendered_config))

    @access.user
    @autoDescribeRoute(Description('Delete your editable draft.').param('id', 'Draft ID', paramType='path'))
    def delete_draft(self, id):
        user = self.gate()
        item = self.config_item(id, user)
        # Claim only a draft, so a concurrent submission cannot be deleted.
        result = Item().collection.update_one({'_id': item['_id'], 'meta.flycut.status': 'draft'},
                                             {'$set': {'meta.flycut.status': 'deleting'}})
        if not result.modified_count:
            raise RestException('Only editable drafts can be deleted.', code=409)
        try:
            remove_config(item, studio_settings.policy()['workspace_folder_id'])
        except Exception:
            Item().collection.update_one({'_id': item['_id'], 'meta.flycut.status': 'deleting'},
                                         {'$set': {'meta.flycut.status': 'draft'}})
            raise
        return {'deleted': id}

    def lock(self, item, action):
        result = Item().collection.update_one({'_id': item['_id'], 'meta.flycut.busy': {'$ne': True}}, {'$set': {'meta.flycut.busy': True, 'meta.flycut.action': action}})
        if not result.modified_count:
            raise RestException('This configuration is already being processed.', code=409)

    @access.user
    @autoDescribeRoute(Description('Generate and store the LightBurn bundle.').param('id', 'Configuration ID', paramType='path'))
    @stack_locked
    def generate_config(self, id):
        user = self.gate()
        item = self.config_item(id, user)
        if item['meta']['flycut'].get('status') == 'draft':
            raise RestException('Submit the draft before generating files.')
        if self.lifecycle(item) in {'generated', 'registered'}:
            return self.serialize(item)
        stack = unpack(configuration(item))['run_params']['stackid']
        if any(other['_id'] != item['_id'] and self.lifecycle(other) in {'generated', 'registered'} for other in self.stack_matches(stack)):
            raise RestException('Another configuration for this Stack ID is generated or registered.', code=409)
        self.lock(item, 'generate')
        folder = None
        files = []
        try:
            item = self.config_item(id, user)
            if self.lifecycle(item) in {'generated', 'registered'}:
                return self.serialize(item)
            raw_config = unpack(configuration(item))
            material = resolve_material(raw_config['run_params']['foil_material'], user)
            raw_config['run_params']['foil_material'] = material['id']
            config = normalize_config(raw_config, user, self.catalog_for(raw_config, user), submitted=True)
            template = config['run_params']['template']
            portal = self.portal_template(template, user) if template.startswith('girder:') else None
            generated_at = datetime.now(timezone.utc).isoformat()
            artifacts = generate(config, portal_template=portal, material_record=material, lifecycle={**item['meta']['flycut'], 'generatedAt': generated_at})
            folder = Folder().load(item['folderId'], user=user, level=AccessType.WRITE, exc=True)
            files = []
            for name, (data, mime) in artifacts.items():
                file = Upload().uploadFromFile(io.BytesIO(data), len(data), name, parentType='folder', parent=folder, user=user, mimeType=mime)
                output_item = Item().load(file['itemId'], force=True)
                extra = {'metadata': json.loads(data)} if name.endswith('-metadata.json') else {}
                annotate(output_item, association(configuration(item)), extra)
                files.append({'_id': str(file['_id']), 'itemId': str(file['itemId']), 'name': name})
            Item().collection.update_one({'_id': item['_id']}, {'$set': {'meta.flycut.outputSchemaVersion': 3, 'meta.flycut.files': files, 'meta.flycut.folderId': str(folder['_id']), 'meta.flycut.status': 'generated', 'meta.flycut.generatedAt': generated_at}})
        except Exception as exc:
            for artifact in files:
                generated_item = Item().load(artifact['itemId'], force=True)
                if generated_item:
                    Item().remove(generated_item)
            if isinstance(exc, ValueError):
                raise RestException(str(exc)) from exc
            raise
        finally:
            Item().collection.update_one({'_id': item['_id']}, {'$set': {'meta.flycut.busy': False}})
        return self.serialize(self.config_item(id, user))

    @access.user
    @autoDescribeRoute(Description('Delete generated files and return to submitted.').param('id', 'Configuration ID', paramType='path'))
    @stack_locked
    def delete_files(self, id):
        user = self.gate()
        item = self.config_item(id, user)
        if self.lifecycle(item) == 'registered':
            raise RestException('Registered stacks cannot have their generated files deleted here.', code=409)
        from bson import ObjectId
        for artifact in item['meta']['flycut'].get('files', []):
            file = File().load(ObjectId(artifact['_id']), user=user, level=AccessType.WRITE)
            if file:
                File().remove(file)
                if not File().findOne({'itemId': file['itemId']}):
                    artifact_item = Item().load(file['itemId'], force=True)
                    if artifact_item and artifact_item['_id'] != item['_id']:
                        Item().remove(artifact_item)
        Item().collection.update_one({'_id': item['_id']}, {'$set': {'meta.flycut.status': 'submitted', 'meta.flycut.overwriteSafe': False},
            '$unset': {'meta.flycut.files': '', 'meta.flycut.folderId': '', 'meta.flycut.generatedAt': ''}})
        return self.serialize(self.config_item(id, user))

    @access.user
    @autoDescribeRoute(Description('Register the generated stack as a child IGSN.').param('id', 'Configuration ID', paramType='path'))
    @stack_locked
    def register_config(self, id):
        user = self.gate()
        item = self.config_item(id, user)
        state = item['meta']['flycut']
        if self.lifecycle(item) != 'registered' and not state.get('files'):
            raise RestException('Generate files before registering.')
        if state.get('registration'):
            return self.serialize(item)
        try:
            from girder_jsonforms.models.deposition import Deposition
        except ImportError as exc:
            raise RestException('Install and enable girder-jsonforms from its igsn branch.', code=503) from exc
        if not all(File().findOne({'_id': ObjectId(file['_id'])}) for file in state['files']):
            raise RestException('Some generated files are missing. Delete the remaining files and regenerate.', code=409)
        config = unpack(configuration(item))
        try:
            test_run = is_test_run(config)
        except ValueError as exc:
            raise RestException(str(exc)) from exc
        material = resolve_material(config['run_params']['foil_material'], user)
        model = Deposition()
        parent = model.findOne({'igsn': material['igsn']})
        if parent is None:
            raise RestException('The parent foil IGSN is not available on this Girder instance.', code=404)
        model.requireAccess(parent, user=user, level=AccessType.WRITE)
        folder = Folder().load(state['folderId'], user=user, level=AccessType.WRITE, exc=True)
        # Check all destination permissions before creating any external identifier.
        artifact_items = [Item().load(f['itemId'], user=user, level=AccessType.WRITE, exc=True) for f in state['files']]
        settings = studio_settings.policy()
        configured_creators = studio_settings.creators(settings, user)
        input_item = load_input(config, user, write=True)
        self.lock(item, 'register')
        try:
            child_igsn = f"{parent['igsn']}-{config['run_params']['stackid']}"
            child = model.findOne({'igsn': child_igsn})
            if child and str(child.get('flycutConfigId', '')) != id:
                raise RestException('This stack IGSN already exists for another configuration.', code=409)
            if not child:
                # Reserve this parent/suffix across workers before contacting the registry.
                # The durable reservation intentionally survives uncertain registry failures.
                from pymongo.errors import DuplicateKeyError
                reservations = Item().collection.database['flycut_registration']
                try:
                    reservations.insert_one({'_id': child_igsn, 'configId': id})
                except DuplicateKeyError as exc:
                    raise RestException('This IGSN has a previous registration attempt. Ask an administrator to reconcile it before retrying.', code=409) from exc
                source = copy.deepcopy(parent)
                source['creatorId'] = user['_id']
                source['track'] = False
                source['metadata'] = stack_metadata(parent['metadata'], user, config['run_params']['stackid'], test_run)
                source['metadata']['creators'] = configured_creators
                source['access'] = studio_settings.access_list(settings, user)
                source['public'] = settings['public_igsn']
                source['publicFlags'] = []
                result = model.create_batch(source, [(config['run_params']['stackid'], None)],
                                            relation_type='IsDerivedFrom', inverse_relation_type='IsSourceOf',
                                            child_titles={config['run_params']['stackid']:
                                                f"Flyer Stack {config['run_params']['stackid']} ({parent['metadata']['titles'][0]['title']})"})
                child = model.load(result.inserted_ids[0], force=True, exc=True)
                child['flycutConfigId'] = id
                child = model.save(child)
            else:
                model.requireAccess(child, user=user, level=AccessType.WRITE)
            parent = model.load(parent['_id'], user=user, level=AccessType.WRITE, exc=True)
            parent['metadata']['alternateIdentifiers'] = foil_identifiers(parent['metadata'], test_run)
            model.save(parent)
            metadata = association(configuration(item))
            link_input(input_item, metadata)
            if input_item:
                model.collection.update_one({'_id': child['_id']}, {'$addToSet': {'flycutInputs': str(input_item['_id'])}})
            Folder().setMetadata(folder, metadata)
            now = datetime.now(timezone.utc).isoformat()
            for artifact in artifact_items:
                extra = {}
                if state.get('outputSchemaVersion', 0) >= 2 and artifact['name'].endswith('-inventory.csv'):
                    from .inventory import register_inventory
                    register_inventory(artifact, user, now)
                if state.get('outputSchemaVersion', 0) >= 3 and artifact['name'].endswith('-metadata.json'):
                    extra['metadata'] = register_metadata(artifact, now, user)
                annotate(artifact, metadata, extra)
            receipt = {**metadata, 'testRun': test_run, 'registeredAt': now, 'parentDepositionId': str(parent['_id']), 'folderId': str(folder['_id']), 'registeredBy': str(user['_id'])}
            data = json.dumps(receipt, indent=2).encode()
            receipt_file = Upload().uploadFromFile(io.BytesIO(data), len(data), f"stack{config['run_params']['stackid']}-registration.json", parentType='folder', parent=folder, user=user, mimeType='application/json')
            Item().setMetadata(Item().load(receipt_file['itemId'], user=user, level=AccessType.WRITE, exc=True), metadata)
            files = state['files'] + [{'_id': str(receipt_file['_id']), 'itemId': str(receipt_file['itemId']), 'name': receipt_file['name']}]
            Item().collection.update_one({'_id': item['_id']}, {'$set': {**{'meta.' + key: value for key, value in metadata.items()}, 'meta.flycut.registration': receipt, 'meta.flycut.files': files, 'meta.flycut.status': 'registered', 'meta.flycut.registeredAt': now}})
        finally:
            Item().collection.update_one({'_id': item['_id']}, {'$set': {'meta.flycut.busy': False}})
        return self.serialize(self.config_item(id, user))

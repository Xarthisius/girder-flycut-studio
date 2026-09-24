import json

import pytest
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.user import User
from girder_dashboards.models.dashboard import Dashboard
from pytest_girder.assertions import assertStatus, assertStatusOk

from test_dashboard import configuration

pytestmark = pytest.mark.plugin('flycut')


@pytest.fixture
def enabled(server, db, user, request, monkeypatch, fsAssetstore):
    from girder_jsonforms.models.deposition import Deposition
    monkeypatch.setattr('girder_jsonforms.models.deposition.get_client', lambda: None)
    if request.node.name not in {'test_registration_uses_model_and_is_idempotent', 'test_register_requires_parent_write'}:
        Deposition().create_deposition(
            {'titles': [{'title': 'Aluminum foil'}], 'relatedIdentifiers': [],
             'alternateIdentifiers': [{'alternateIdentifier': 'foilIGSN aluminum', 'alternateIdentifierType': 'Local'}]},
            creator=user, igsn='JHAMAB00010', public=False)
    doc = Dashboard().findOne({'key': 'flycut-config'})
    from girder.models.collection import Collection
    collection = Collection().createCollection('Flyer tests', creator=user, public=False)
    folder = Folder().createFolder(collection, 'Workspace', parentType='collection', creator=user, public=False)
    doc['settings'] = {'workspace_folder_id': str(folder['_id']), 'owners_include_user': True}
    doc['enabled'] = True
    Dashboard().save(doc)
    return doc


def test_auth_and_disabled(server, user):
    assertStatus(server.request('/flycut/options'), 401)
    assertStatus(server.request('/flycut/options', user=user), 403)


def test_save_owns_identity_and_isolation(server, enabled, user):
    response = server.request('/flycut/config', method='POST', user=user, params={'submit': True, 'validated': True, 'config': json.dumps(configuration())})
    assertStatusOk(response)
    config = response.json
    assert config['config']['run_parameters']['operator'] == 'spoofed'
    folder = Folder().load(Item().load(config['_id'], force=True)['folderId'], force=True)
    assert not folder['public']
    other = User().createUser('other', 'password123', 'Other', 'Person', 'other@example.org')
    assert server.request('/flycut/config', user=other).json == []
    assertStatus(server.request(f"/flycut/config/{config['_id']}/generate", method='POST', user=other), 403)


def test_generation_persists_bundle(server, enabled, user, fsAssetstore):
    config = server.request('/flycut/config', method='POST', user=user, params={'submit': True, 'validated': True, 'config': json.dumps(configuration())}).json
    response = server.request(f"/flycut/config/{config['_id']}/generate", method='POST', user=user)
    assertStatusOk(response)
    assert len(response.json['files']) == 3
    repeated = server.request(f"/flycut/config/{config['_id']}/generate", method='POST', user=user)
    assertStatusOk(repeated)
    assert repeated.json['files'] == response.json['files']
    download = server.request('/file/' + response.json['files'][0]['_id'] + '/download', user=user, isJson=False)
    assertStatusOk(download)
    # Browser navigation sends the session cookie, not the AJAX token header.
    from girder.models.token import Token
    cookie = 'girderToken=' + str(Token().createToken(user)['_id'])
    artifact = response.json['files'][0]
    for resource, identifier in [('file', artifact['_id']), ('item', artifact['itemId'])]:
        path = f'/{resource}/{identifier}/download'
        assertStatusOk(server.request(path, cookie=cookie,
            params={'contentDisposition': 'inline'}, isJson=False))
        assertStatus(server.request(path), 401)


def test_validation_and_dashboard_acl(server, enabled, user):
    config = configuration()
    config['run_params']['template'] = '../secret'
    assertStatus(server.request('/flycut/config', method='POST', user=user, params={'submit': True, 'validated': True, 'config': json.dumps(config)}), 400)
    enabled['public'] = False
    Dashboard().save(enabled)
    assertStatus(server.request('/flycut/options', user=user), 403)


def test_registration_uses_model_and_is_idempotent(server, enabled, user, fsAssetstore, monkeypatch):
    from girder_jsonforms.models.deposition import Deposition
    from girder_jsonforms.settings import PluginSettings
    from girder.models.setting import Setting
    from girder.constants import AccessType
    # Local mode only: no external registry calls in tests.
    monkeypatch.setattr('girder_jsonforms.models.deposition.get_client', lambda: None)
    Setting().set(PluginSettings.IGSN_PREFIX, '10.12345')
    model = Deposition()
    parent = model.create_deposition(
        {'titles': [{'title': 'Aluminum foil'}],
         'creators': [{'name': 'Test Operator', 'nameType': 'Personal'}],
         'publisher': {'name': 'Test Laboratory'}, 'publicationYear': '2026',
         'relatedIdentifiers': [], 'alternateIdentifiers': [{'alternateIdentifier': 'foilIGSN', 'alternateIdentifierType': 'Local'}]},
        creator=user, igsn='JHAMAB00010', public=False)
    config = server.request('/flycut/config', method='POST', user=user, params={'submit': True, 'validated': True, 'config': json.dumps(configuration())}).json
    generated = server.request(f"/flycut/config/{config['_id']}/generate", method='POST', user=user)
    assertStatusOk(generated)
    response = server.request(f"/flycut/config/{config['_id']}/register", method='POST', user=user)
    assertStatusOk(response)
    assert response.json['registration']['igsn'] == 'JHAMAB00010-00005'
    child = model.findOne({'igsn': 'JHAMAB00010-00005'})
    assert child['creatorId'] == user['_id']
    assert child['parentId'] == parent['_id']
    repeated = server.request(f"/flycut/config/{config['_id']}/register", method='POST', user=user)
    assertStatusOk(repeated)
    assert repeated.json['registration'] == response.json['registration']
    assert model.collection.count_documents({'igsn': child['igsn']}) == 1


def test_register_requires_parent_write(server, enabled, user, admin, fsAssetstore, monkeypatch):
    from girder_jsonforms.models.deposition import Deposition
    monkeypatch.setattr('girder_jsonforms.models.deposition.get_client', lambda: None)
    parent = Deposition().create_deposition(
        {'titles': [{'title': 'Restricted foil'}], 'creators': [{'name': 'Admin'}],
         'publisher': {'name': 'Lab'}, 'publicationYear': '2026', 'relatedIdentifiers': [], 'alternateIdentifiers': [{'alternateIdentifier': 'foilIGSN', 'alternateIdentifierType': 'Local'}]},
        creator=admin, igsn='JHAMAB00010', public=True)
    config = server.request('/flycut/config', method='POST', user=user, params={'submit': True, 'validated': True, 'config': json.dumps(configuration())}).json
    assertStatusOk(server.request(f"/flycut/config/{config['_id']}/generate", method='POST', user=user))
    assertStatus(server.request(f"/flycut/config/{config['_id']}/register", method='POST', user=user), 403)
    assert Deposition().findOne({'igsn': 'JHAMAB00010-00005'}) is None


def test_custom_configuration_name(server, enabled, user):
    response = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(configuration()), 'name': '  September trial  '})
    assertStatusOk(response)
    assert response.json['name'] == 'September trial'
    assertStatus(server.request('/flycut/config', method='POST', user=user,
        params={'submit': True, 'validated': True, 'config': json.dumps(configuration()), 'name': 'x' * 161}), 400)


def test_draft_save_update_submit_and_immutability(server, enabled, user):
    raw = {'run_params': {'stackid': '', 'operator': ''}, 'laser_params': [],
           'custom_fields': {}, 'custom_field_rows': [{'name': '', 'value': 'unfinished'}]}
    draft = server.request('/flycut/config', method='POST', user=user, params={'config': json.dumps(raw)} )
    assertStatusOk(draft)
    assert draft.json['status'] == 'draft'
    assert draft.json['customFieldRows'] == raw['custom_field_rows']
    draft_id = draft.json['_id']
    updated = server.request('/flycut/config', method='POST', user=user,
        params={'id': draft_id, 'config': json.dumps(raw), 'name': 'Work in progress'})
    assertStatusOk(updated)
    assert updated.json['_id'] == draft_id
    assert updated.json['name'] == 'Work in progress'
    assertStatus(server.request('/flycut/config', method='POST', user=user,
        params={'id': draft_id, 'config': json.dumps(raw), 'submit': True}), 400)
    valid = configuration()
    valid['run_params']['operator'] = ''
    assertStatus(server.request('/flycut/config', method='POST', user=user,
        params={'id': draft_id, 'config': json.dumps(valid), 'submit': True}), 400)
    submitted = server.request('/flycut/config', method='POST', user=user,
        params={'id': draft_id, 'config': json.dumps(valid), 'submit': True, 'validated': True})
    assertStatusOk(submitted)
    assert submitted.json['_id'] == draft_id
    assert submitted.json['status'] == 'submitted'
    assertStatus(server.request('/flycut/config', method='POST', user=user,
        params={'id': draft_id, 'config': json.dumps(raw)}), 409)


def test_portal_template_and_timestamped_draft(server, enabled, user, admin, fsAssetstore):
    import io
    from pathlib import Path
    from girder.models.upload import Upload
    from girder_flycut.generate import generate
    from girder_flycut.validation import normalize_config
    from test_dashboard import CATALOG
    import xml.etree.ElementTree as ET
    folder = Folder().createFolder(user, 'Portal templates', parentType='user', creator=user, public=False)
    source = Path(__file__).parents[1] / 'girder_flycut/inputs/templates/5x5-stack.lbrn2'
    original = normalize_config(configuration(), user, CATALOG)
    data = generate(original)['stack00005-layout.lbrn2'][0]
    file = Upload().uploadFromFile(io.BytesIO(data), len(data), 'proxy.lbrn2', parentType='folder', parent=folder, user=user)
    response = server.request('/flycut/template-item/' + str(file['itemId']), user=user)
    assertStatusOk(response)
    assert response.json['id'] == 'girder:' + str(file['_id'])
    assert response.json['layers']
    assert len(response.json['flyers']) == 25
    other = User().createUser('browserother', 'password123', 'Other', 'Person', 'browserother@example.org')
    assertStatus(server.request('/flycut/templates/' + response.json['id'], user=other), 403)
    config = configuration()
    config['run_params']['template'] = response.json['id']
    params = {'config': json.dumps(config), 'name': 'Timestamped draft'}
    draft = server.request('/flycut/config', method='POST', user=user, params=params)
    assertStatusOk(draft)
    assert draft.json['savedAt']
    updated = server.request('/flycut/config', method='POST', user=user, params={**params, 'id': draft.json['_id']})
    assertStatusOk(updated)
    assert updated.json['savedAt'] > draft.json['savedAt']
    final = server.request('/flycut/config', method='POST', user=user, params={**params, 'id': draft.json['_id'], 'submit': True, 'validated': True})
    assertStatusOk(final)
    assert final.json['config']['run_parameters']['template'] == response.json['id']
    assert final.json['name'] == 'stack00005-config'
    assert final.json['submittedAt'] == final.json['savedAt']
    assertStatusOk(server.request('/flycut/config/' + final.json['_id'] + '/generate', method='POST', user=user))


def test_duplicate_stack_warning_and_timestamp_order(server, enabled, user):
    config = configuration()
    config['custom_fields'] = {}
    first = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(config), 'name': 'Temporary title', 'submit': True, 'validated': True})
    assertStatusOk(first)
    assert first.json['name'] == 'stack00005-config'
    assert server.request('/flycut/submitted-stacks', user=user).json == ['00005']
    duplicate = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(config), 'submit': True})
    assertStatus(duplicate, 400)
    confirmed = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(config), 'submit': True, 'validated': True})
    assertStatusOk(confirmed)
    assert confirmed.json['name'] == 'stack00005-config'
    draft = server.request('/flycut/config', method='POST', user=user, params={'config': json.dumps(config)})
    assertStatusOk(draft)
    assert server.request('/flycut/config', user=user).json[0]['_id'] == draft.json['_id']
    other = server.request('/flycut/config', method='POST', user=user, params={'config': json.dumps(config)})
    update = server.request('/flycut/config', method='POST', user=user,
        params={'id': draft.json['_id'], 'config': json.dumps(config)})
    assertStatusOk(update)
    assert server.request('/flycut/config', user=user).json[0]['_id'] == draft.json['_id']


def test_lowest_stack_id_uses_drafts_and_submissions(server, enabled, user):
    assert server.request('/flycut/next-stack-id', user=user).json['stackid'] == '00000'
    for stack in ['00000', '00002']:
        config = configuration()
        config['run_params']['stackid'] = stack
        assertStatusOk(server.request('/flycut/config', method='POST', user=user, params={'config': json.dumps(config)}))
    assert server.request('/flycut/next-stack-id', user=user).json['stackid'] == '00001'
    config['run_params']['stackid'] = '00001'
    assertStatusOk(server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(config), 'submit': True, 'validated': True}))
    assert server.request('/flycut/next-stack-id', user=user).json['stackid'] == '00003'


def test_delete_draft_only_owner_and_never_submitted(server, enabled, user):
    draft = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(configuration())}).json
    other = User().createUser('resetother', 'password123', 'Other', 'Person', 'resetother@example.org')
    assertStatus(server.request('/flycut/config/' + draft['_id'], method='DELETE', user=other), 403)
    assert Item().load(draft['_id'], force=True)
    assertStatusOk(server.request('/flycut/config/' + draft['_id'], method='DELETE', user=user))
    assert Item().load(draft['_id'], force=True) is None
    submitted = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(configuration()), 'submit': True, 'validated': True}).json
    assertStatus(server.request('/flycut/config/' + submitted['_id'], method='DELETE', user=user), 409)
    assert Item().load(submitted['_id'], force=True)['meta']['flycut']['status'] == 'submitted'


def test_lifecycle_replacement_files_and_mock_registration(server, enabled, user, fsAssetstore):
    config = configuration()
    config['custom_fields']['glass_bl_mm'] = None
    params = {'config': json.dumps(config), 'submit': True, 'validated': True}
    first = server.request('/flycut/config', method='POST', user=user, params=params).json
    replacement = server.request('/flycut/config', method='POST', user=user, params=params)
    assertStatusOk(replacement)
    assert replacement.json['_id'] == first['_id']
    assert len(server.request('/flycut/config', user=user).json) == 1
    endpoint = '/flycut/config/' + first['_id']
    generated = server.request(endpoint + '/generate', method='POST', user=user)
    assertStatusOk(generated)
    assert generated.json['status'] == 'generated'
    assertStatus(server.request('/flycut/config', method='POST', user=user, params=params), 409)
    assert server.request('/flycut/stack-states', user=user).json['00005'] == 'generated'
    removed = server.request(endpoint + '/files', method='DELETE', user=user)
    assertStatusOk(removed)
    assert removed.json['status'] == 'submitted'
    for artifact in generated.json['files']:
        from girder.models.file import File
        assert File().load(artifact['_id'], force=True) is None
    assertStatusOk(server.request('/flycut/config', method='POST', user=user, params=params))
    assertStatusOk(server.request(endpoint + '/generate', method='POST', user=user))
    registered = server.request(endpoint + '/mock-register', method='POST', user=user)
    assertStatusOk(registered)
    assert registered.json['status'] == 'registered'
    assert registered.json['registration']['mock'] is True
    assertStatus(server.request('/flycut/config', method='POST', user=user, params=params), 409)
    assertStatus(server.request(endpoint + '/files', method='DELETE', user=user), 409)
    assert server.request(endpoint + '/mock-register', method='POST', user=user).json['registration'] == registered.json['registration']


def test_presets_disabled_preserve_explicit_fields(server, enabled, user):
    assert server.request('/flycut/options', user=user).json['presets'] == []
    config = configuration()
    config['preset'] = 'standard'
    result = server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(config), 'submit': True, 'validated': True})
    assertStatusOk(result)
    assert result.json['config']['preset'] is None
    assert result.json['config']['custom_fields'] == config['custom_fields']


@pytest.mark.plugin('jsonforms')
@pytest.mark.parametrize('test_run', [True, False])
def test_live_foil_catalog_and_dynamic_registration(server, enabled, user, admin, fsAssetstore, test_run):
    from girder_jsonforms.models.deposition import Deposition
    model = Deposition()
    def foil(igsn, owner, local, public=False):
        return model.create_deposition(
            {'titles': [{'title': 'Dynamic foil'}], 'relatedIdentifiers': [],
             'creators': [{'name': 'Original foil creator'}],
             'alternateIdentifiers': [{'alternateIdentifier': local, 'alternateIdentifierType': 'Local'}]},
            creator=owner, igsn=igsn, public=public)
    parent = foil('DYNAMIC00001', user, 'Lab foil-igsn platinum')
    foil('HIDDEN00001', admin, 'foilIGSN private')
    foil('OTHER00001', user, 'stackIGSN')
    response = server.request('/flycut/options', user=user)
    assertStatusOk(response)
    ids = {entry['id'] for entry in response.json['materials']}
    assert ids == {'JHAMAB00010', 'DYNAMIC00001'}
    config = configuration()
    config['run_params']['foil_material'] = 'DYNAMIC00001'
    config['custom_fields']['test_run'] = str(test_run).lower()
    config['custom_fields'].update({f'foil_{corner}_um': 42 for corner in ['tl', 'tr', 'bl', 'br']})
    saved = server.request('/flycut/config', method='POST', user=user,
        params={'submit': True, 'validated': True, 'config': json.dumps(config)})
    assertStatusOk(saved)
    endpoint = '/flycut/config/' + saved.json['_id']
    generated = server.request(endpoint + '/generate', method='POST', user=user)
    assertStatusOk(generated)
    from girder.models.file import File
    from bson import ObjectId
    artifact = next(f for f in generated.json['files'] if f['name'].endswith('metadata.json'))
    with File().open(File().load(ObjectId(artifact['_id']), force=True)) as stream:
        exported = json.load(stream)
    assert exported['material']['igsn'] == parent['igsn']
    assert exported['custom_fields']['foil_tl_um'] == 42
    assert 'configuration' not in exported
    assert 'thickness' not in exported
    registered = server.request(endpoint + '/register', method='POST', user=user)
    assertStatusOk(registered)
    assert registered.json['status'] == 'registered'
    assert registered.json['registration']['igsn'] == 'DYNAMIC00001-00005'
    child = model.findOne({'igsn': 'DYNAMIC00001-00005'})
    assert child['parentId'] == parent['_id']
    assert child['creatorId'] == user['_id']
    assert child['metadata']['creators'][0]['givenName'] == user['firstName']
    assert child['metadata']['creators'][0]['familyName'] == user['lastName']
    assert child['metadata']['creators'][0]['name'] != 'Original foil creator'
    assert child['metadata']['titles'] == [{'title':
        f"Flyer Stack {config['run_params']['stackid']} ({parent['metadata']['titles'][0]['title']})"}]
    alternates = {entry['alternateIdentifier'] for entry in child['metadata']['alternateIdentifiers']}
    assert alternates == {'stack-igsn', 'stack-00005'} | ({'stack-test'} if test_run else set())
    assert child['metadata']['relatedIdentifiers'] == [{'relationType': 'IsDerivedFrom', 'relatedIdentifier': parent['igsn'], 'relatedIdentifierType': 'IGSN'}]
    parent = model.load(parent['_id'], force=True)
    assert parent['metadata']['relatedIdentifiers'] == [{'relationType': 'IsSourceOf', 'relatedIdentifier': child['igsn'], 'relatedIdentifierType': 'IGSN'}]
    foil_alternates = {entry['alternateIdentifier'] for entry in parent['metadata']['alternateIdentifiers']}
    assert 'foil-igsn' in foil_alternates
    assert ('foil-test' in foil_alternates) == test_run
    assert registered.json['registration']['testRun'] == test_run
    for file in registered.json['files']:
        meta = Item().load(file['itemId'], force=True)['meta']
        if file['name'].endswith('-inventory.csv'):
            assert meta == {'foilIgsn': parent['igsn'], 'igsn': child['igsn'], 'stackid': '00005'}
            import csv
            with File().open(File().load(ObjectId(file['_id']), force=True)) as stream:
                rows = list(csv.DictReader(__import__('io').StringIO(stream.read().decode())))
            assert rows and {row['status'] for row in rows} == {'registered'}
        elif file['name'].endswith('-metadata.json'):
            assert meta['igsn'] == child['igsn']
            assert meta['metadata']['time_registered']
            assert 'config' not in meta
        else:
            assert 'config' not in meta
            assert meta['igsn'] == child['igsn']
    assert Item().load(saved.json['_id'], force=True)['meta']['config'] == saved.json['config']
    assert server.request(endpoint + '/register', method='POST', user=user).json['registration'] == registered.json['registration']
    assert model.collection.count_documents({'parentId': parent['_id']}) == 1
    assert 'DYNAMIC00001-00005' not in {m['id'] for m in server.request('/flycut/options', user=user).json['materials']}


def test_registration_rejects_missing_artifact(server, enabled, user, fsAssetstore):
    from girder.models.file import File
    from bson import ObjectId
    saved = server.request('/flycut/config', method='POST', user=user,
        params={'submit': True, 'validated': True, 'config': json.dumps(configuration())}).json
    endpoint = '/flycut/config/' + saved['_id']
    generated = server.request(endpoint + '/generate', method='POST', user=user).json
    File().remove(File().load(ObjectId(generated['files'][0]['_id']), force=True))
    assertStatus(server.request(endpoint + '/register', method='POST', user=user), 409)


@pytest.mark.parametrize('value, expected', [('true', True), ('false', False), ('yes', True), ('0', False), (None, False)])
def test_test_run_values(value, expected):
    from girder_flycut.registration import is_test_run
    assert is_test_run({'custom_fields': {'test_run': value}}) is expected


def test_invalid_test_run_rejected(server, enabled, user):
    config = configuration()
    config['custom_fields']['test_run'] = 'maybe'
    assertStatus(server.request('/flycut/config', method='POST', user=user,
        params={'config': json.dumps(config), 'submit': True, 'validated': True}), 400)


def test_admin_settings_validation(server, enabled, user, admin):
    assertStatus(server.request('/flycut/settings', user=user), 403)
    assertStatus(server.request('/flycut/settings', method='PUT', user=user, params={'settings': '{}'}), 403)
    result = server.request('/flycut/settings', user=admin)
    assertStatusOk(result)
    settings = result.json['settings']
    assert settings['workspace_path'].startswith('/collection/')
    settings['public_igsn'] = 'false'
    assertStatus(server.request('/flycut/settings', method='PUT', user=admin, params={'settings': json.dumps(settings)}), 400)
    settings['public_igsn'] = False
    settings['creators'] = [{'type':'group', 'id':'not-an-id'}]
    assertStatus(server.request('/flycut/settings', method='PUT', user=admin, params={'settings': json.dumps(settings)}), 400)


@pytest.mark.plugin('jsonforms')
def test_shared_workspace_access_and_creator_policy(server, enabled, user, admin, fsAssetstore):
    from girder.models.group import Group
    from girder.constants import AccessType
    from girder_jsonforms.models.deposition import Deposition
    group = Group().createGroup('Owners', creator=user, public=False)
    editor = User().createUser('editor', 'password123', 'Other', 'Editor', 'editor@example.org')
    viewer = User().createUser('viewer', 'password123', 'Read', 'Only', 'viewer@example.org')
    settings = dict(enabled['settings'])
    settings.update(owners=[{'type':'group', 'id':str(group['_id'])}], owners_include_user=False,
                    editors=[{'type':'user', 'id':str(editor['_id'])}], editors_include_user=False,
                    viewers=[{'type':'user', 'id':str(viewer['_id'])}], viewers_include_user=False,
                    creators=[{'type':'group', 'id':str(group['_id'])}, {'type':'user', 'id':str(editor['_id'])}],
                    creators_include_user=True, public_igsn=True, public_files=False)
    response = server.request('/flycut/settings', method='PUT', user=admin, params={'settings':json.dumps(settings)})
    assertStatusOk(response)
    root = Folder().load(settings['workspace_folder_id'], force=True)
    Folder().setUserAccess(root, editor, AccessType.WRITE, save=True)
    Folder().setUserAccess(root, viewer, AccessType.READ, save=True)
    foil = Deposition().findOne({'igsn':'JHAMAB00010'})
    Deposition().setUserAccess(foil, editor, AccessType.WRITE, save=True)
    saved = server.request('/flycut/config', method='POST', user=user, params={'config':json.dumps(configuration())})
    assertStatusOk(saved)
    identifier = saved.json['_id']
    record = Item().load(identifier, force=True)
    folder = Folder().load(record['folderId'], force=True)
    assert Folder().load(folder['parentId'], force=True)['name'] == 'Drafts'
    assert not folder['public']
    assert Folder().hasAccess(folder, editor, AccessType.WRITE)
    assert not Folder().hasAccess(folder, editor, AccessType.ADMIN)
    assert Folder().hasAccess(folder, viewer, AccessType.READ)
    assert not Folder().hasAccess(folder, viewer, AccessType.WRITE)
    assert server.request('/flycut/config', user=editor).json[0]['_id'] == identifier
    assert server.request('/flycut/config', user=viewer).json[0]['canEdit'] is False
    params = {'id':identifier, 'config':json.dumps(configuration()), 'submit':True, 'validated':True}
    assertStatus(server.request('/flycut/config', method='POST', user=viewer, params=params), 403)
    assertStatusOk(server.request('/flycut/config', method='POST', user=editor, params=params))
    folder = Folder().load(folder['_id'], force=True)
    assert folder['parentId'] == root['_id']
    assert folder['name'] == 'stack00005'
    endpoint = '/flycut/config/' + identifier
    assertStatus(server.request(endpoint + '/generate', method='POST', user=viewer), 403)
    generated = server.request(endpoint + '/generate', method='POST', user=editor)
    assertStatusOk(generated)
    assert generated.json['folderId'] == str(folder['_id'])
    assertStatusOk(server.request(endpoint + '/files', method='DELETE', user=editor))
    regenerated = server.request(endpoint + '/generate', method='POST', user=editor)
    assertStatusOk(regenerated)
    assert regenerated.json['folderId'] == str(folder['_id'])
    assert Item().collection.count_documents({'folderId':folder['_id']}) == 4
    registered = server.request(endpoint + '/register', method='POST', user=editor)
    assertStatusOk(registered)
    child = Deposition().findOne({'igsn': registered.json['registration']['igsn']})
    assert child['public'] is True
    assert child['creatorId'] == editor['_id']
    assert child['metadata']['creators'] == [
        {'name':'Owners', 'nameType':'Organizational'},
        {'name':'Other Editor', 'nameType':'Personal', 'givenName':'Other', 'familyName':'Editor'}]
    assert Deposition().hasAccess(child, viewer, AccessType.READ)
    assert not Deposition().hasAccess(child, viewer, AccessType.WRITE)
    assert Deposition().hasAccess(child, User().load(user['_id'], force=True), AccessType.ADMIN)
    assert not Folder().load(folder['_id'], force=True)['public']
    # Metadata alone must not let the plugin mutate an unrelated folder.
    outside = Folder().createFolder(user, 'Outside', parentType='user', creator=user, public=False)
    Item().move(record, outside)
    assertStatus(server.request(endpoint + '/generate', method='POST', user=user), 403)


def test_untitled_draft_promotes_to_stack_folder(server, enabled, user, fsAssetstore):
    draft = server.request('/flycut/config', method='POST', user=user, params={'config': '{}'}).json
    item = Item().load(draft['_id'], force=True)
    original_folder = item['folderId']
    assert Folder().load(original_folder, force=True)['name'].startswith('draft-')
    submitted = server.request('/flycut/config', method='POST', user=user,
        params={'id':draft['_id'], 'config':json.dumps(configuration()), 'submit':True, 'validated':True})
    assertStatusOk(submitted)
    folder = Folder().load(original_folder, force=True)
    assert folder['name'] == 'stack00005'
    assert str(folder['parentId']) == enabled['settings']['workspace_folder_id']
    generated = server.request('/flycut/config/' + draft['_id'] + '/generate', method='POST', user=user)
    assertStatusOk(generated)
    assert generated.json['folderId'] == str(original_folder)
    assert Item().collection.count_documents({'folderId':original_folder}) == 4


@pytest.mark.plugin('jsonforms')
def test_canonical_config_and_history(server, enabled, user):
    from girder.models.file import File
    from girder_flycut.schema import pack
    cfg = pack(configuration())
    cfg['laser_parameters'].pop('style', None)
    cfg['laser_parameters'].pop('x', None)
    cfg['laser_parameters'].update({'repeat':1, 'wraparound':True})
    cfg['custom_fields']['measured_at'] = '2026-09-24T12:00:00Z'
    saved = server.request('/flycut/config', method='POST', user=user,
        params={'config':json.dumps(cfg), 'submit':True, 'validated':True})
    assertStatusOk(saved)
    record = Item().load(saved.json['_id'], force=True)
    assert record['meta']['config'] == cfg
    assert 'config' not in record['meta']['flycut']
    file = File().findOne({'itemId':record['_id']})
    with File().open(file) as stream:
        assert json.load(stream) == cfg
    endpoint = '/flycut/config/' + saved.json['_id']
    def generate_metadata():
        response = server.request(endpoint + '/generate', method='POST', user=user)
        assertStatusOk(response)
        metadata_file = next(f for f in response.json['files'] if f['name'].endswith('-metadata.json'))
        with File().open(File().load(metadata_file['_id'], force=True)) as stream:
            payload = json.load(stream)
        assert Item().load(metadata_file['itemId'], force=True)['meta']['metadata'] == payload
        assert payload['time_submitted'] and payload['time_generated']
        assert payload['time_registered'] is None and payload['time_machined'] is None
        assert payload['material'] == {'igsn':'JHAMAB00010','name':'Aluminum foil'}
        assert payload['unique_safe'] is True
        return payload
    assert generate_metadata()['overwrite_safe'] is True
    assertStatusOk(server.request(endpoint + '/files', method='DELETE', user=user))
    assert generate_metadata()['overwrite_safe'] is False
    assertStatusOk(server.request(endpoint + '/files', method='DELETE', user=user))
    replacement = server.request('/flycut/config', method='POST', user=user,
        params={'config':json.dumps(cfg), 'submit':True, 'validated':True})
    assertStatusOk(replacement)
    assert generate_metadata()['overwrite_safe'] is False


@pytest.mark.plugin('jsonforms')
def test_excel_input_links(server, enabled, user):
    import io, base64
    from openpyxl import Workbook
    from girder.models.file import File
    from girder_jsonforms.models.deposition import Deposition
    workbook = Workbook()
    workbook.active.append(['power','speed','qpulsewidth','frequency','passes'])
    workbook.active.append([20,100,200,100,1])
    output = io.BytesIO()
    workbook.save(output)
    result = server.request('/flycut/import-laser-params', method='POST', user=user,
        params={'payload':json.dumps({'filename':'input.xlsx','data':base64.b64encode(output.getvalue()).decode()})})
    assertStatusOk(result)
    ref = result.json['reference']
    input_item = Item().load(ref['itemId'], force=True)
    folder = Folder().load(input_item['folderId'], force=True)
    assert folder['name'] == 'Excel Imports'
    assert str(folder['parentId']) == enabled['settings']['workspace_folder_id']
    with File().open(File().load(ref['fileId'], force=True)) as stream:
        assert stream.read() == output.getvalue()
    cfg = configuration()
    cfg['parameter_import_file'] = ref
    saved = server.request('/flycut/config', method='POST', user=user,
        params={'config':json.dumps(cfg), 'submit':True, 'validated':True})
    assertStatusOk(saved)
    endpoint = '/flycut/config/' + saved.json['_id']
    assertStatusOk(server.request(endpoint + '/generate', method='POST', user=user))
    assertStatusOk(server.request(endpoint + '/register', method='POST', user=user))
    assert Item().load(ref['itemId'], force=True)['meta'] == {'igsn':['JHAMAB00010-00005']}
    assert Deposition().findOne({'igsn':'JHAMAB00010-00005'})['flycutInputs'] == [ref['itemId']]

    # Reuse the same workbook for another stack, including legacy scalar metadata.
    Item().collection.update_one({'_id': input_item['_id']}, {'$set': {'meta.igsn': 'JHAMAB00010-00005'}})
    cfg['run_params']['stackid'] = '00006'
    second = server.request('/flycut/config', method='POST', user=user,
        params={'config':json.dumps(cfg), 'submit':True, 'validated':True})
    assertStatusOk(second)
    endpoint = '/flycut/config/' + second.json['_id']
    assertStatusOk(server.request(endpoint + '/generate', method='POST', user=user))
    assertStatusOk(server.request(endpoint + '/register', method='POST', user=user))
    from girder_flycut.import_storage import link_input
    link_input(input_item, {'igsn':'JHAMAB00010-00006'})
    meta = Item().load(ref['itemId'], force=True)['meta']
    assert set(meta) == {'igsn'}
    assert set(meta['igsn']) == {'JHAMAB00010-00005','JHAMAB00010-00006'}
    assert len(meta['igsn']) == 2
    assert Deposition().findOne({'igsn':'JHAMAB00010-00006'})['flycutInputs'] == [ref['itemId']]


def test_stack_id_format_cannot_be_acknowledged(server, enabled, user):
    for stack in ['bad id', 'OOOOO', 'F12', 'abcde', '123456', 'F１２３']:
        config = configuration()
        config['run_params']['stackid'] = stack
        response = server.request('/flycut/config', method='POST', user=user,
            params={'submit': True, 'validated': True, 'config': json.dumps(config)})
        assertStatus(response, 400)
        assert 'Stack ID must match' in response.json['message']

import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

from girder_flycut.generate import generate
from girder_flycut.validation import normalize_config

CATALOG = json.loads((Path(__file__).parents[1] / 'girder_flycut/catalog.json').read_text())
CATALOG['materials'] = [{'id': 'JHAMAB00010'}]
USER = {'_id': '012345678901234567890123', 'login': 'alice'}


def configuration(style='cycle'):
    return {'run_params': {'stackid': '00005', 'operator': 'spoofed', 'foil_material': 'JHAMAB00010', 'template': '5x5-stack.lbrn2'},
            'laser_assignment': {'style': style, 'x': 2},
            'laser_params': [{'color': color, 'power': power, 'speed': 100, 'qpulsewidth': 200, 'frequency': 100, 'passes': 1} for color, power in [('#ff0000', 25), ('#00ff00', 50)]],
            'custom_fields': {'glass_tl_mm': '7.5', **{f'foil_{corner}_um': '100' for corner in ['tl','tr','bl','br']}}}


class GenerationTest(unittest.TestCase):
    def test_identity_is_server_owned(self):
        config = normalize_config(configuration(), USER, CATALOG)
        self.assertEqual(config['run_params']['operator'], 'alice')
        self.assertEqual(config['createdBy'], USER['_id'])

    def test_reject_invalid_inputs(self):
        for field, value in [('stackid', '../bad'), ('template', '../secret'), ('foil_material', '/etc/passwd')]:
            config = configuration()
            config['run_params'][field] = value
            with self.assertRaises(ValueError):
                normalize_config(config, USER, CATALOG)
        for value in [float('nan'), -1, '50', True]:
            config = configuration()
            config['laser_params'][0]['power'] = value
            with self.assertRaises(ValueError):
                normalize_config(config, USER, CATALOG)

    def test_cycle_and_repeat_match_preview(self):
        for style, expected in [('cycle', ['25', '50', '25', '50']), ('repeat', ['25', '25', '50', '50'])]:
            config = normalize_config(configuration(style), USER, CATALOG)
            files = generate(config)
            self.assertEqual(len(files), 3)
            root = ET.fromstring(files['stack00005-layout.lbrn2'][0])
            cuts = {cut.find('name').get('Value'): cut for cut in root.findall('.//CutSetting') if cut.find('name') is not None}
            actual = [cuts[f'F{i}'].find('maxPower').get('Value') for i in range(1, 5)]
            self.assertEqual(actual, expected)
            metadata = json.loads(files['stack00005-metadata.json'][0])
            self.assertNotIn('thickness', metadata)
            self.assertNotIn('configuration', metadata)
            self.assertEqual(metadata['custom_fields']['glass_tl_mm'], '7.5')
            self.assertEqual(metadata['operator'], 'alice')
            self.assertEqual(len(metadata['flyers']), 25)
            self.assertTrue(any(s.get('Str') == '00005' for s in root.findall('.//Shape')))

    def test_generation_without_foil_thickness(self):
        for fields in [{}, {'foil_tl_um': '42'}]:
            with self.subTest(fields=fields):
                config = configuration()
                config['custom_fields'] = fields
                normalized = normalize_config(config, USER, CATALOG)
                for material in [None, {'igsn': 'JHAMAB00010', 'name': 'Foil'}]:
                    files = generate(normalized, material_record=material)
                    self.assertEqual(len(files), 3)
                    metadata = json.loads(files['stack00005-metadata.json'][0])
                    self.assertNotIn('thickness', metadata)
                    self.assertNotIn('thickness_um', metadata['material'])
                    self.assertEqual(metadata['custom_fields'], normalized['custom_fields'])

    def test_exact_preserves_unassigned_template_layer(self):
        config = normalize_config(configuration('exact'), USER, CATALOG)
        result = ET.fromstring(generate(config)['stack00005-layout.lbrn2'][0])
        source = ET.parse(Path(__file__).parents[1] / 'girder_flycut/inputs/templates/5x5-stack.lbrn2').getroot()
        def f3(root):
            return next(c for c in root.findall('.//CutSetting') if c.find('name') is not None and c.find('name').get('Value') == 'F3')
        self.assertEqual(ET.tostring(f3(result)), ET.tostring(f3(source)))

    def test_every_catalog_template_generates(self):
        for template in CATALOG['templates']:
            config = configuration()
            config['run_params']['template'] = template['id']
            result = generate(normalize_config(config, USER, CATALOG))
            metadata = json.loads(result['stack00005-metadata.json'][0])
            self.assertEqual(len(metadata['flyers']), template['flyer_count'])

class AssignmentControlsTest(unittest.TestCase):
    def test_repeat_wrap_and_reserved_positions(self):
        source = ET.parse(Path(__file__).parents[1] / 'girder_flycut/inputs/templates/5x5-stack.lbrn2').getroot()
        def cut(root, n):
            return next(c for c in root.findall('.//CutSetting') if c.find('name') is not None and c.find('name').get('Value') == f'F{n}')
        for wrap in [True, False]:
            config = configuration()
            config['laser_assignment'] = {'repeat': 2, 'wraparound': wrap}
            config['laser_params'][0]['enabled'] = False
            files = generate(normalize_config(config, USER, CATALOG))
            result = ET.fromstring(files['stack00005-layout.lbrn2'][0])
            # Disabled F1 occupies both positions; F2 stays in positions 3 and 4.
            for n in [1, 2, 5, 6]:
                self.assertEqual(ET.tostring(cut(result, n)), ET.tostring(cut(source, n)))
            for n in [3, 4]:
                self.assertEqual(cut(result, n).find('maxPower').get('Value'), '50')
            if wrap:
                self.assertEqual(cut(result, 7).find('maxPower').get('Value'), '50')
            else:
                self.assertEqual(ET.tostring(cut(result, 7)), ET.tostring(cut(source, 7)))
            metadata = json.loads(files['stack00005-metadata.json'][0])
            self.assertEqual(float(metadata['flyers'][0]['laser_maxpower']), float(cut(source, 1).find('maxPower').get('Value')))

    def test_assignment_validation_and_legacy_import(self):
        from girder_flycut.validation import assignment_options
        self.assertEqual(assignment_options({'repeat': 1, 'wraparound': True}), (1, True))
        self.assertEqual(assignment_options({'style': 'exact', 'x': 8}), (1, False))
        self.assertEqual(assignment_options({'style': 'cycle', 'x': 8}), (1, True))
        self.assertEqual(assignment_options({'style': 'repeat', 'x': 3}), (3, True))
        for assignment in [{'repeat': 0}, {'repeat': 1.5}, {'repeat': True}, {'repeat': 1, 'wraparound': 'false'}]:
            with self.assertRaises(ValueError):
                assignment_options(assignment)
        config = configuration()
        config['laser_params'][0]['enabled'] = 'false'
        with self.assertRaises(ValueError):
            normalize_config(config, USER, CATALOG)


class DisabledParametersTest(unittest.TestCase):
    def test_disabled_parameters_are_preserved_and_generate(self):
        config = configuration()
        config['laser_params'][0]['enabled'] = False
        normalized = normalize_config(config, USER, CATALOG)
        fields = ['power', 'speed', 'qpulsewidth', 'frequency', 'passes']
        self.assertTrue(all(normalized['laser_params'][0][key] == config['laser_params'][0][key] for key in fields))
        self.assertEqual(len(generate(normalized)), 3)
        for key in fields:
            normalized['laser_params'][0][key] = None
        normalize_config(normalized, USER, CATALOG)
        normalized['laser_params'][0]['enabled'] = True
        with self.assertRaises(ValueError):
            normalize_config(normalized, USER, CATALOG)


class BuilderExportTest(unittest.TestCase):
    def test_warning_values_and_fallbacks(self):
        from girder_flycut.validation import normalize_builder_config
        config = configuration()
        config['run_params'].update(stackid='00005', operator='')
        config['custom_fields'] = {'empty': ''}
        result = normalize_builder_config(config, USER, CATALOG)
        self.assertEqual(result['custom_fields']['empty'], None)
        self.assertEqual(result['run_params']['operator'], USER['login'])
        self.assertEqual(result['run_params']['stackid'], '00005')
        config['laser_params'] = [dict(config['laser_params'][0], enabled=False)]
        with self.assertRaises(ValueError):
            normalize_builder_config(config, USER, CATALOG)


class SectionSchemaTest(unittest.TestCase):
    def test_roundtrip_and_order(self):
        from girder_flycut.schema import pack, unpack
        original = normalize_config(configuration(), USER, CATALOG)
        final = pack(original)
        self.assertEqual(list(final)[:4], ['preset', 'run_parameters', 'laser_parameters', 'custom_fields'])
        self.assertEqual(list(final['laser_parameters']['flyers'][0])[:5], ['name', 'enabled', 'is_default', 'from_import', 'color'])
        self.assertEqual(unpack(final)['run_params'], original['run_params'])
        self.assertEqual(len(generate(normalize_config(final, USER, CATALOG))), 3)


def test_output_groups_and_short_template_identity(tmp_path):
    from girder_flycut.template_identity import resolve_template, id_cut
    import csv
    import io
    originals = Path(__file__).parents[1] / 'girder_flycut/inputs/templates'
    identifiers = []
    for path in originals.glob('*.lbrn2'):
        root = ET.parse(path).getroot()
        identifier = id_cut(root).find('subname').get('Value')
        assert 0 < len(identifier) <= 16
        identifiers.append(identifier)
    assert len(identifiers) == len(set(identifiers))
    for style, expected in [('cycle', ['F1','F2','F1','F2']), ('repeat', ['F1','F1','F3','F3']), ('exact', ['F1','F2','TF3','TF4'])]:
        cfg = normalize_config(configuration(style), USER, CATALOG)
        output = generate(cfg)
        metadata = json.loads(output['stack00005-metadata.json'][0])
        assert [f['group'] for f in metadata['flyers'][:4]] == expected
        rows = list(csv.DictReader(io.StringIO(output['stack00005-inventory.csv'][0].decode())))
        assert [r['group'] for r in rows[:4]] == expected
        assert {r['status'] for r in rows} == {'specified'}
        proxy = tmp_path / 'renamed-generated.lbrn2'
        proxy.write_bytes(output['stack00005-layout.lbrn2'][0])
        assert id_cut(ET.parse(proxy).getroot()).find('subname').get('Value') == '5x5'
        _, sidecar = resolve_template(proxy, [originals])
        assert sidecar['template'] == '5x5-stack.lbrn2'
        assert sidecar['placeholder_id'] == '00005'
        regenerated = generate(cfg, portal_template=({}, ET.parse(proxy).getroot(), sidecar))
        assert id_cut(ET.fromstring(regenerated['stack00005-layout.lbrn2'][0])).find('subname').get('Value') == '5x5'


def test_default_and_template_groups_and_custom_name():
    cfg = normalize_config(configuration('exact'), USER, CATALOG)
    cfg['laser_params'][0]['is_default'] = True
    source = Path(__file__).parents[1] / 'girder_flycut/inputs/templates/5x5-stack.lbrn2'
    sidecar = json.loads(source.with_suffix('.json').read_text())
    output = generate(cfg, portal_template=({'label':'my-custom-layout.lbrn2'}, ET.parse(source).getroot(), sidecar))
    metadata = json.loads(output['stack00005-metadata.json'][0])
    assert [row['group'] for row in metadata['flyers'][:4]] == ['default','F2','TF3','TF4']
    assert metadata['template']['name'] == 'my-custom-layout.lbrn2'
    assert metadata['template']['version'] == sidecar['version']
    assert metadata['source'].endswith('v1.0')

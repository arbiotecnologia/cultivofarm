from pathlib import Path
import tempfile, unittest, json
from export import CONFIGS, export
from materialize import materialize

class CompactTests(unittest.TestCase):
    def fixture(self):
        root = Path(tempfile.mkdtemp()); (root / 'src/assets').mkdir(parents=True)
        (root / 'src/main.ts').write_bytes('const nome = "aplicação";\r\n'.encode('utf-8'))
        (root / 'src/assets/image.png').write_bytes(b'\x89PNG\r\n\x00\xff')
        (root / 'src/.env').write_text('NEVER_EXPORT=secret')
        (root / 'src/node_modules').mkdir(); (root / 'src/node_modules/excluded.ts').write_text('no')
        for name in CONFIGS: (root / name).write_text('{}\n')
        return root

    def test_utf8_crlf_and_binary_roundtrip(self):
        root = self.fixture(); out = Path(tempfile.mkdtemp()) / 'snapshot'
        m = export(root, out, 'local-test'); dest = Path(tempfile.mkdtemp()) / 'checkout'
        self.assertEqual(materialize(out / 'manifest.json', dest), len(CONFIGS) + 2)
        for rel in m['files_sha256']: self.assertEqual((dest / rel).read_bytes(), (root / rel).read_bytes())
        self.assertFalse((dest / 'src/.env').exists()); self.assertFalse((dest / 'src/node_modules').exists())

    def test_tampered_part_no_partial_writes(self):
        out = Path(tempfile.mkdtemp()) / 'snapshot'; m = export(self.fixture(), out, 'test')
        part = out / m['parts'][0]['path']; part.write_bytes(part.read_bytes() + b'x')
        dest = Path(tempfile.mkdtemp()) / 'checkout'
        with self.assertRaises(ValueError): materialize(out / 'manifest.json', dest)
        self.assertFalse(dest.exists())

    def test_destination_not_empty(self):
        out = Path(tempfile.mkdtemp()) / 'snapshot'; export(self.fixture(), out, 'test')
        dest = Path(tempfile.mkdtemp()); (dest / 'keep').write_text('safe')
        with self.assertRaises(ValueError): materialize(out / 'manifest.json', dest)
        self.assertEqual((dest / 'keep').read_text(), 'safe')

    def test_symlink_fails_closed(self):
        root = self.fixture(); (root / 'src/link.ts').symlink_to(root / 'package.json')
        with self.assertRaises(ValueError): export(root, Path(tempfile.mkdtemp()) / 'out', 'test')

    def test_private_key_fails_closed(self):
        root = self.fixture(); (root / 'src/key.ts').write_text('-----BEGIN PRIVATE KEY-----\nNOT_A_PLACEHOLDER\n-----END PRIVATE KEY-----')
        with self.assertRaises(ValueError): export(root, Path(tempfile.mkdtemp()) / 'out', 'test')

    def test_invalid_pem_placeholder_is_source_not_secret(self):
        root = self.fixture(); (root / 'src/placeholder.test.ts').write_text('const pem="-----BEGIN PRIVATE KEY-----\\nQUJD\\n-----END PRIVATE KEY-----";')
        out = Path(tempfile.mkdtemp()) / 'snapshot'; m = export(root, out, 'test')
        self.assertIn('src/placeholder.test.ts', m['files_sha256'])

    def test_transitive_relative_imports_outside_src(self):
        root = self.fixture(); (root / 'shared').mkdir()
        (root / 'src/main.ts').write_text('import { x } from "../shared/first";')
        (root / 'shared/first.ts').write_text('export { x } from "./second";')
        (root / 'shared/second.ts').write_text('export const x = 1;')
        out = Path(tempfile.mkdtemp()) / 'snapshot'; m = export(root, out, 'test')
        self.assertIn('shared/first.ts', m['files_sha256']); self.assertIn('shared/second.ts', m['files_sha256'])

if __name__ == '__main__': unittest.main()
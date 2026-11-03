import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("guard", Path(__file__).with_name("verify_snapshot.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class PathGuardTests(unittest.TestCase):
    def test_relative_path_stays_in_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(guard.safe_path(root, "src/new.ts"), root / "src/new.ts")

    def test_traversal_absolute_and_metadata_are_denied(self):
        with tempfile.TemporaryDirectory() as folder:
            for path in ["../escape", "/tmp/escape", "a/../../escape", "a\\escape", ".git/config", "a//x"]:
                with self.subTest(path=path), self.assertRaises(ValueError):
                    guard.safe_path(Path(folder), path)

    def test_symlink_escape_is_denied(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "escape").symlink_to("/tmp", target_is_directory=True)
            with self.assertRaises(ValueError):
                guard.safe_path(root, "escape/file")


if __name__ == "__main__":
    unittest.main()
#!/usr/bin/env python3
"""One directed synthetic image-store portability case; no Docker, secrets or old DR suites."""
import sys
sys.dont_write_bytecode = True

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('dr_capture_test', 'backup-controller-dr.py')
stack = load('dr_stack_test', 'verify-controller-dr-stack.py')


class Portability(unittest.TestCase):
    def test_capture_and_resolve_store_independent_identity(self):
        roles = ('api', 'web', 'db', 'nginx')
        commands = {'api': ['sh', '-lc', 'prisma migrate deploy && node dist/main.js'],
                    'web': ['node', 'server.js'], 'db': ['postgres'], 'nginx': ['nginx', '-g', 'daemon off;']}
        source, loaded = {}, {}
        for index, role in enumerate(roles, 1):
            source_id, local_id = 'sha256:' + str(index) * 64, 'sha256:' + str(index + 4) * 64
            image = {'Id': source_id, 'Config': {'Cmd': commands[role], 'Env': ['PG_MAJOR=17'] if role == 'db' else ['NODE_ENV=production'],
                                               'Labels': {'synthetic': role}},
                     'RootFS': {'Type': 'layers', 'Layers': ['sha256:' + 'a' * 64, 'sha256:' + str(index) * 64]},
                     'Os': 'linux', 'Architecture': 'amd64', 'Variant': None,
                     'Descriptor': {'digest': source_id}, 'RepoTags': ['synthetic-source/' + role + ':old']}
            source[source_id] = image
            imported = copy.deepcopy(image)
            imported['Id'] = local_id
            imported.pop('Descriptor')
            imported['GraphDriver'] = {'Name': 'overlay2', 'Data': {'synthetic': 'different-local-store'}}
            imported['RepoTags'] = ['synthetic-loaded/' + role + ':changed']
            loaded[local_id] = imported
            canonical = json.dumps({k: image.get(k) for k in ['Config', 'RootFS', 'Os', 'Architecture', 'Variant']},
                                   sort_keys=True, separators=(',', ':'))
            self.assertEqual(backup.image_fingerprint(image), hashlib.sha256(canonical.encode()).hexdigest())
            self.assertEqual(backup.image_fingerprint(image), stack.identity.image_fingerprint(imported))
        # A latest-tagged decoy must never substitute for a matching image.
        decoy = copy.deepcopy(next(iter(loaded.values())))
        decoy['Id'] = 'sha256:' + '9' * 64
        decoy['Config']['Labels']['synthetic'] = 'different-image'
        decoy['RepoTags'] = ['monitor-pfsense-api:latest']
        loaded[decoy['Id']] = decoy

        def source_run(args, **_):
            args = [str(x) for x in args]
            if args[:3] == ['docker', 'image', 'inspect']:
                return json.dumps([source[args[3]]]).encode()
            if args[-2:] == ['images', '-q']:
                return ('\n'.join(source) + '\n').encode()
            if args[0] == 'git':
                return ('a' * 40 + '\n').encode()
            self.fail('Unexpected synthetic capture command')

        def target_run(args, **_):
            if args[:3] == ['docker', 'image', 'ls']:
                return ('\n'.join(loaded) + '\n').encode()
            self.assertEqual(args[:3], ['docker', 'image', 'inspect'])
            self.assertTrue(all(x in loaded for x in args[3:]), 'Must inspect destination local IDs only')
            return json.dumps([loaded[x] for x in args[3:]]).encode()

        with tempfile.TemporaryDirectory(prefix='controller-dr-portability-') as temp:
            root = Path(temp).resolve()
            repo, payload = root / 'repo', root / 'payload'
            repo.mkdir()
            payload.mkdir()
            for name in ('.env.api', '.env.web', '.env.db', 'compose.yaml', 'config/package-release.env', 'infra/nginx/default.conf'):
                path = repo / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('SYNTHETIC_ONLY=fixture\n')
            # Source/package capture is covered independently by the offline-assets group.
            with patch.object(backup.dr, 'run', side_effect=source_run), \
                 patch.object(backup, 'copy_recovery_assets', return_value=({}, {})):
                files = backup.copy_runtime(repo, payload, [])
            release_file = payload / 'runtime/release.json'
            release = json.loads(release_file.read_text())
            self.assertEqual(release['image_identity'], 'docker-inspect-execution-v1')
            self.assertEqual(len(release['image_specs']), 4)
            self.assertEqual(files['runtime/release.json'], backup.dr.digest(release_file))
            with patch.object(stack.dr, 'run', side_effect=target_run):
                resolved = stack.image_roles(payload)
                self.assertEqual(resolved, {role: 'sha256:' + str(index + 4) * 64 for index, role in enumerate(roles, 1)})
                local_api = resolved['api']
                original = copy.deepcopy(loaded[local_api])
                for change in ('config', 'layers', 'variant'):
                    candidate = loaded[local_api]
                    if change == 'config':
                        candidate['Config']['Env'] = ['DIFFERENT_EXECUTION=true']
                    elif change == 'layers':
                        candidate['RootFS']['Layers'].reverse()
                    else:
                        candidate['Variant'] = 'v2'
                    with self.assertRaises(stack.dr.DRError):
                        stack.image_roles(payload)
                    loaded[local_api] = copy.deepcopy(original)
            # Old files remain usable by the data verifier; boot refuses metadata-free fallback.
            legacy = {k: v for k, v in release.items() if k not in ('image_specs', 'image_identity')}
            release_file.write_text(json.dumps(legacy))
            with patch.object(stack.dr, 'run') as no_docker:
                with self.assertRaises(stack.dr.DRError):
                    stack.image_roles(payload)
                no_docker.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)

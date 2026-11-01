#!/usr/bin/env python3
"""220: boot exact recovered images on an isolated disposable network; no migrations/keep."""
import sys
sys.dont_write_bytecode = True

import argparse
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid

spec = importlib.util.spec_from_file_location('dr_verify_data', Path(__file__).with_name('verify-controller-dr.py'))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
dr = verify.dr
identity_spec = importlib.util.spec_from_file_location('dr_image_identity', Path(__file__).with_name('backup-controller-dr.py'))
identity = importlib.util.module_from_spec(identity_spec)
identity_spec.loader.exec_module(identity)
SUBNET = ipaddress.ip_network('10.77.19.0/24')
LABEL = 'monitor-pfsense.dr-session'
DISABLED = (
    'COMMAND_WORKER_ENABLED', 'NOTIFICATIONS_ENABLED', 'METRIC_ROLLUPS_ENABLED',
    'PACKAGE_UPGRADE_ENABLED', 'PFSENSE_UPGRADE_ENABLED', 'OPERATIONAL_ACTIONS_ENABLED',
    'SERVICE_RESTART_ENABLED', 'NODE_REBOOT_ENABLED', 'TECHNICIAN_ACCOUNTS_ENABLED',
    'TECHNICIAN_ACCOUNT_CREATE_ENABLED', 'TECHNICIAN_ACCOUNT_PASSWORD_RESET_ENABLED',
    'TECHNICIAN_ACCOUNT_DISABLE_ENABLED', 'TECHNICIAN_ACCOUNT_DELETE_ENABLED',
    'PFSENSE_API_ENABLED', 'PFSENSE_ALIAS_READ_ENABLED', 'PFSENSE_ALIAS_APPLY_ENABLED',
    'PFSENSE_VAULT_ENABLED', 'BACKUP_DIFF_ENABLED', 'BACKUP_DRIFT_ENABLED',
)


def inspect(kind, value):
    return json.loads(dr.run(['docker', kind, 'inspect', value]))[0]


def image_roles(payload):
    release = json.loads((payload / 'runtime/release.json').read_text())
    specs = release.get('image_specs')
    dr.require(release.get('image_identity') == identity.IMAGE_IDENTITY_VERSION and
               isinstance(specs, list) and len(specs) == 4, 'Snapshot lacks portable image identity')
    expected = {}
    source_ids = set()
    for spec in specs:
        dr.require(set(spec) == {'source_id', 'role', 'fingerprint'} and
                   spec['role'] in {'api', 'web', 'db', 'nginx'} and spec['role'] not in expected and
                   isinstance(spec['source_id'], str) and re.fullmatch(r'sha256:[0-9a-f]{64}', spec['source_id']) and
                   isinstance(spec['fingerprint'], str) and re.fullmatch(r'[0-9a-f]{64}', spec['fingerprint']),
                   'Invalid portable image specification')
        expected[spec['role']] = spec['fingerprint']
        source_ids.add(spec['source_id'])
    recorded_ids = release.get('image_ids')
    dr.require(isinstance(recorded_ids, list) and len(recorded_ids) == 4 and
               all(isinstance(x, str) and re.fullmatch(r'(?:sha256:)?[0-9a-f]{64}', x) for x in recorded_ids) and
               {x if x.startswith('sha256:') else 'sha256:' + x for x in recorded_ids} == source_ids and
               len(source_ids) == 4 and len(set(expected.values())) == 4, 'Inconsistent release image identities')
    # Enumerate local IDs, not tags. The destination may expose a config ID instead of source index ID.
    candidates = sorted(set(dr.run(['docker', 'image', 'ls', '--all', '--quiet', '--no-trunc']).decode().split()))
    dr.require(all(re.fullmatch(r'sha256:[0-9a-f]{64}', x) for x in candidates), 'Invalid local image ID')
    matches = {role: set() for role in expected}
    for offset in range(0, len(candidates), 64):
        images = json.loads(dr.run(['docker', 'image', 'inspect', *candidates[offset:offset + 64]]))
        for image in images:
            # Unrelated images may not have filesystem layers; do not classify or trust their tags.
            try:
                fingerprint = identity.image_fingerprint(image)
            except ValueError:
                continue
            for role, required_hash in expected.items():
                if fingerprint != required_hash:
                    continue
                local_id = image['Id']
                dr.require(local_id in candidates and identity.image_role(image) == role,
                           'Portable image role mismatch')
                matches[role].add(local_id)
    dr.require(all(matches.values()), 'Required portable release image missing')
    # Equivalent local index/manifest IDs are interchangeable only after full execution hash equality.
    return {role: min(local_ids) for role, local_ids in matches.items()}


def assert_subnet_available():
    networks = dr.run(['docker', 'network', 'ls', '--quiet']).decode().split()
    for network in networks:
        item = inspect('network', network)
        for config in item.get('IPAM', {}).get('Config') or []:
            if config.get('Subnet'):
                other = ipaddress.ip_network(config['Subnet'], strict=False)
                dr.require(other.version != 4 or not SUBNET.overlaps(other), 'DR subnet overlaps Docker network')
    # Include host routes and interface addresses, without touching network/firewall settings.
    routes = json.loads(dr.run(['ip', '-j', '-4', 'route', 'show', 'table', 'all']))
    addresses = json.loads(dr.run(['ip', '-j', '-4', 'address', 'show']))
    candidates = [r['dst'] for r in routes if r.get('dst') and r['dst'] != 'default']
    for interface in addresses:
        for address in interface.get('addr_info', []):
            if address.get('family') == 'inet':
                candidates.append(address['local'] + '/' + str(address['prefixlen']))
    for candidate in candidates:
        dr.require(not SUBNET.overlaps(ipaddress.ip_network(candidate, strict=False)),
                   'DR subnet overlaps host routing')


class Stack:
    def __init__(self, payload, manifest, images):
        self.payload, self.manifest, self.images = payload, manifest, images
        self.token = uuid.uuid4().hex
        self.network = 'monitor-pfsense-dr-stack-' + self.token
        self.bridge = 'drb' + self.token[:10]
        self.names = {role: self.network + '-' + role for role in ('db', 'api', 'web', 'nginx')}
        self.attempted = []
        self.network_attempted = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        failed = False
        # Try every cleanup even if an earlier removal fails; delete only our labelled resources.
        for name in reversed(self.attempted):
            try:
                result = subprocess.run(['docker', 'container', 'inspect', name],
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    item = json.loads(result.stdout)[0]
                    dr.require(item['Config'].get('Labels', {}).get(LABEL) == self.token, 'DR owner mismatch')
                    dr.run(['docker', 'rm', '-f', '-v', name])
            except (dr.DRError, OSError, ValueError, KeyError):
                failed = True
        if self.network_attempted:
            try:
                result = subprocess.run(['docker', 'network', 'inspect', self.network],
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    item = json.loads(result.stdout)[0]
                    dr.require(item.get('Labels', {}).get(LABEL) == self.token, 'DR network owner mismatch')
                    dr.run(['docker', 'network', 'rm', self.network])
            except (dr.DRError, OSError, ValueError, KeyError):
                failed = True
        dr.require(not failed, 'DR stack cleanup failed')

    def create_network(self):
        assert_subnet_available()
        self.network_attempted = True
        dr.run(['docker', 'network', 'create', '--driver', 'bridge', '--internal',
                '--subnet', str(SUBNET), '--label', LABEL + '=' + self.token,
                '--opt', 'com.docker.network.bridge.name=' + self.bridge,
                '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated',
                '--opt', 'com.docker.network.bridge.enable_ip_masquerade=false', self.network])
        item = inspect('network', self.network)
        dr.require(item['Internal'] and not item.get('EnableIPv6') and
                   item.get('Options', {}).get('com.docker.network.bridge.gateway_mode_ipv4') == 'isolated',
                   'DR network isolation mismatch')
        addresses = json.loads(dr.run(['ip', '-j', 'address', 'show', 'dev', self.bridge]))
        dr.require(not any(a.get('family') in ('inet', 'inet6') for i in addresses for a in i.get('addr_info', [])),
                   'DR bridge must have no host address')

    def start(self, role, extra, command=(), memory='1g'):
        name = self.names[role]
        self.attempted.append(name)
        dr.run(['docker', 'run', '--pull=never', '-d', '--name', name, '--label', LABEL + '=' + self.token,
                '--network', self.network, '--network-alias', role, '--dns', '127.0.0.1',
                '--cpus', '1', '--memory', memory, '--memory-swap', memory, '--pids-limit', '256',
                '--log-driver', 'none', '--no-healthcheck', '--ulimit', 'core=0',
                '--security-opt', 'no-new-privileges', *extra, self.images[role], *command])
        item = inspect('container', name)
        dr.require(not item['HostConfig'].get('PortBindings') and
                   set(item['NetworkSettings']['Networks']) == {self.network}, 'Unexpected stack exposure')

    def db_query(self, sql):
        data = dr.run(['docker', 'exec', '-i', self.names['db'], 'psql', '-X', '-qAt',
                       '-v', 'ON_ERROR_STOP=1', '-U', 'dr_verify', '-d', 'monitor_qa'], data=sql.encode())
        return data.decode().splitlines()

    def restore(self):
        self.start('db', ['-e', 'POSTGRES_DB=monitor_qa', '-e', 'POSTGRES_USER=dr_verify',
                          '-e', 'POSTGRES_HOST_AUTH_METHOD=trust'])
        ready = False
        for _ in range(60):
            check = subprocess.run(['docker', 'exec', self.names['db'], 'pg_isready',
                                    '-U', 'dr_verify', '-d', 'monitor_qa'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if check.returncode == 0:
                ready = True
                break
            time.sleep(1)
        dr.require(ready, 'Stack database not ready')
        with (self.payload / 'postgres.dump').open('rb') as source:
            result = subprocess.run(['docker', 'exec', '-i', self.names['db'], 'pg_restore', '--exit-on-error',
                                     '--no-owner', '--no-privileges', '-U', 'dr_verify', '-d', 'monitor_qa'],
                                    stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dr.require(result.returncode == 0, 'Stack restore failed')
        # Validation queries are read-only. Application startup may write only to this disposable DB.
        refs = [json.loads(x) for x in self.db_query('BEGIN READ ONLY;\n' + dr.REF_SQL + '\nROLLBACK;')]
        verify.compare_refs(self.manifest['refs'], refs)

    def private_mount(self, path, target, owner=False):
        if owner:
            paths = [path, *path.rglob('*')] if path.is_dir() else [path]
            for item in paths:
                dr.require(not item.is_symlink(), 'Symlink in private stack copy')
                os.chown(item, 100, 101)
                item.chmod(0o500 if item.is_dir() else 0o400)
        return ['--mount', 'type=bind,source=' + str(path) + ',target=' + target + ',readonly']

    def boot(self):
        env_api = self.private_mount(self.payload / 'runtime/.env.api', '/run/dr/api.env', owner=True)
        release = self.private_mount(self.payload / 'runtime/config/package-release.env', '/app/config/package-release.env', owner=True)
        backups = self.payload / 'backups'
        backups.mkdir(exist_ok=True, mode=0o700)
        prefix = self.manifest['storage_prefix']
        dr.require(prefix == '/app/data/pfsense-config-backups', 'Stack requires standard restored storage prefix')
        backup_mount = self.private_mount(backups, prefix, owner=True)
        package_dir = self.payload / 'runtime/recovery-assets/dist/pfsense-package'
        dr.require(package_dir.is_dir(), 'Snapshot lacks offline package artifacts')
        package_mount = self.private_mount(package_dir, '/app/dist/pfsense-package', owner=True)
        api_env = ['--user', '100:101', '--entrypoint', 'node', '-e', 'PORT=8088',
                   '-e', 'DATABASE_URL=postgresql://dr_verify@db:5432/monitor_qa',
                   '-e', 'TRUST_PROXY=false', '-e', 'TRUSTED_PROXY_IPS=', '-e', 'NODE_OPTIONS=',
                   '-e', 'AUTH_COOKIE_SECURE=false',
                   '-e', 'RBAC_SCOPE_ENABLED=true', '-e', 'RBAC_PERMISSIONS_ENABLED=true',
                   '-e', 'NODE_RECONCILE_INTERVAL_SECONDS=86400',
                   '-e', 'BACKUP_STORAGE_DIR=' + prefix]
        for flag in DISABLED:
            api_env += ['-e', flag + '=false']
        self.start('api', api_env + env_api + release + backup_mount + package_mount,
                   ['--env-file=/run/dr/api.env', '--env-file=/app/config/package-release.env', 'dist/main.js'])
        env_web = self.private_mount(self.payload / 'runtime/.env.web', '/run/dr/web.env', owner=True)
        self.start('web', ['--user', '100:101', '--entrypoint', 'node', '-e', 'PORT=3000',
                           '-e', 'HOSTNAME=0.0.0.0', '-e', 'NODE_OPTIONS=',
                           '-e', 'MONITOR_API_BASE_URL=http://api:8088', *env_web],
                   ['--env-file=/run/dr/web.env', 'server.js'])
        nginx_config = self.private_mount(self.payload / 'runtime/infra/nginx/default.conf',
                                          '/etc/nginx/conf.d/default.conf')
        self.start('nginx', nginx_config, memory='128m')

    def probe(self):
        # No request targets an original host; response bodies stay in memory and aren't printed.
        program = r'''
const fs = require('node:fs');
const rows = fs.readFileSync('/proc/net/route','utf8').trim().split('\n').slice(1);
if(rows.some(r=>r.trim().split(/\s+/)[1]==='00000000')) process.exit(2);
const targets=[['http://api:8088/healthz',true],['http://web:3000/login',false],
 ['http://nginx:8088/login',false],['http://nginx:8088/healthz',true]];
(async()=>{ for(let n=0;n<60;n++) { try {
 for(const [url,health] of targets) {
  const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(2500)});
  if(res.status!==200) throw Error();
  if(health){ const body=await res.json(); if(body.ok!==true||body.database!=='up')throw Error(); }
  else {const body=await res.text(); if(!body.includes('<form')||!body.includes('password'))throw Error();}
 }
 process.exit(0);
 }catch{await new Promise(r=>setTimeout(r,1000));} } process.exit(3);
})().catch(()=>process.exit(4));
'''
        dr.run(['docker', 'exec', self.names['api'], 'node', '-e', program])
        for name in self.names.values():
            item = inspect('container', name)
            dr.require(item['State']['Running'] and not item['State'].get('OOMKilled') and
                       not item['HostConfig'].get('PortBindings'), 'Stack process unhealthy')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('identifier', nargs='?', default='latest')
    args = parser.parse_args()
    dr.host_guard()
    work = dr.private_dir(dr.STATE / 'stack-work')
    with dr.locked(dr.DEST / '.lock'):
        identifier = args.identifier
        if identifier == 'latest':
            choices = sorted(p.name for p in dr.DEST.iterdir() if dr.ID_PATTERN.fullmatch(p.name))
            dr.require(choices, 'No DR set available')
            identifier = choices[-1]
        archive = dr.DEST / dr.validate_id(identifier)
        dr.validate_set(archive)
        with tempfile.TemporaryDirectory(prefix='boot-', dir=work) as directory:
            payload = dr.private_dir(directory)
            names = verify.decrypt_extract(archive / 'controller.tar.gpg', payload, dr.KEYS)
            manifest = verify.validate_manifest(payload, names)
            images = image_roles(payload)
            with Stack(payload, manifest, images) as stack:
                stack.create_network()
                stack.restore()
                stack.boot()
                stack.probe()
    print('DR STACK PASS (restored database, exact images, API/web/nginx; cleaned)')


if __name__ == '__main__':
    sys.exit(dr.cli_error(main))

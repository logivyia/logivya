"""Run on Linux: verify collisions cannot delete another restore's resources."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

with tempfile.TemporaryDirectory(prefix='logivya-isolation-test-') as name:
    directory = Path(name)
    docker = directory / 'docker'
    log = directory / 'docker.log'
    docker.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_DOCKER_LOG"\ncase "$*" in "container inspect "*) exit 0;; *) exit 99;; esac\n')
    docker.chmod(0o700)
    manifest = directory / 'manifest.json'
    archive = directory / 'archive.enc'
    archive.write_bytes(b'not used: collision must stop before restore')
    env = {**os.environ, 'PATH': str(directory) + ':' + os.environ['PATH'], 'TEST_DOCKER_LOG': str(log)}
    manifest.write_text(json.dumps({'backupId': 'production-postgres-collision'}))
    result = subprocess.run(['sh', sys.argv[1], str(archive), str(manifest)], env=env, capture_output=True)
    assert result.returncode == 66, result.stderr
    assert all(line.startswith('container inspect ') for line in log.read_text().splitlines()), 'Collision triggered destructive cleanup'
    manifest.write_text(json.dumps({'backupId': 'production-postgres-x/../../victim'}))
    result = subprocess.run(['sh', sys.argv[1], str(archive), str(manifest)], env=env, capture_output=True)
    assert result.returncode == 65, result.stderr
print('Restore isolation: pre-existing resources preserved; invalid identifiers rejected.')

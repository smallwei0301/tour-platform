#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXED_DOCKER,
  strictSpawn,
  validateSupplyRequest,
} from './resolve-toolchain-supply.mjs';

const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;

function exactSet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.every((value, index) => value === right[index]);
}

function inspectExact(output, image) {
  const parsed = JSON.parse(output);
  const inspection = Array.isArray(parsed) ? parsed[0] : null;
  if (!inspection
    || !IMAGE_ID.test(inspection.Id ?? '')
    || (image.localPresent && inspection.Id !== image.localImageId)
    || inspection.Architecture !== image.architecture
    || !Array.isArray(inspection.RepoDigests)
    || !inspection.RepoDigests.includes(image.repoDigest)) {
    throw new Error(`image read-back mismatch: ${image.repoDigest}`);
  }
  return inspection;
}

export async function acquireImages(request, {
  runDocker = async (args) => (await strictSpawn(FIXED_DOCKER, args, { timeoutMs: 570_000 })).stdout,
} = {}) {
  validateSupplyRequest(request);
  const missing = request.images.filter((image) => !image.localPresent);
  const missingRefs = missing.map((image) => image.repoDigest);

  if (missing.length) {
    if (request.approval.status !== 'approved') {
      throw new Error('owner approval is required before any image acquisition');
    }
    if (!exactSet(request.approval.approvedDigests, missingRefs)) {
      throw new Error('owner approval must match the exact digest set');
    }
    // Approval and the complete digest set are validated before the first pull.
    for (const image of missing) {
      await runDocker(['pull', image.repoDigest]);
    }
  }

  const inspections = [];
  for (const image of request.images) {
    const output = await runDocker(['image', 'inspect', image.repoDigest]);
    inspections.push(inspectExact(output, image));
  }
  return inspections;
}

function value(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return 'Usage: acquire-toolchain-images.mjs --approved-request <json> --docker /usr/bin/docker\n';
}

async function main(args) {
  if (args.includes('--help')) {
    process.stdout.write(usage());
    return;
  }
  const requestPath = value(args, '--approved-request');
  const dockerPath = value(args, '--docker');
  if (!requestPath || dockerPath !== FIXED_DOCKER) throw new Error(usage().trim());
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  validateSupplyRequest(request);
  if (request.docker.path !== FIXED_DOCKER || request.docker.realpath !== FIXED_DOCKER) {
    throw new Error('Docker path substitution refused');
  }
  await acquireImages(request, {
    runDocker: async (dockerArgs) => (await strictSpawn(dockerPath, dockerArgs, { timeoutMs: 570_000 })).stdout,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`toolchain acquirer: ${error.message}\n`);
    process.exitCode = 1;
  });
}

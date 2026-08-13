import { spawnSync } from 'node:child_process';

const { env: runtimeEnvironment } = process;
const INSTALL_ARGUMENTS = Object.freeze(['ci', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund']);

function buildInstallEnvironment(environment) {
  return {
    ...environment,
    npm_config_include: 'dev',
    npm_config_omit: '',
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  };
}

function runNpmInstall({ projectRoot, argv, env }) {
  return spawnSync('npm', argv, {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  });
}

async function verifyProjectLocalPg() {
  return import('pg');
}

export async function prepareDatabaseTestDependencies({
  projectRoot = process.cwd(),
  environment = runtimeEnvironment,
  runNpm = runNpmInstall,
  verifyProjectLocalPg: verifyPg = verifyProjectLocalPg,
} = {}) {
  const env = buildInstallEnvironment(environment);
  const install = await runNpm({ projectRoot, argv: INSTALL_ARGUMENTS, env });
  if (install.status !== 0 || install.signal || install.error) {
    throw new Error(`database-test dependency install failed (status=${install.status}, signal=${install.signal ?? 'none'})`);
  }

  try {
    await verifyPg();
  } catch (error) {
    throw new Error(`project-local pg import verification failed: ${error.message}`, { cause: error });
  }

  return { verified: true };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  await prepareDatabaseTestDependencies();
}

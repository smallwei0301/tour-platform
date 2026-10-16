'use strict';
// Scoped lint/build safeguard. Node children and workers must retain this preload.
const { syncBuiltinESMExports } = require('node:module');
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');
const dgram = require('node:dgram');
const cp = require('node:child_process');
const threads = require('node:worker_threads');
const preload = `--require=${__filename}`;
const blocked = () => { throw new Error('tp-node22 offline outbound blocked'); };
net.Socket.prototype.connect = blocked;
tls.connect = blocked;
dgram.createSocket = blocked;
for (const name of Object.keys(dns)) {
  if (/^(lookup|resolve|reverse)/.test(name) && typeof dns[name] === 'function') dns[name] = blocked;
}
for (const name of Object.keys(dns.promises)) {
  if (/^(lookup|resolve|reverse)/.test(name)) dns.promises[name] = blocked;
}
globalThis.fetch = blocked;
// npm and Next spawn Node through a fixed shell; no child may drop the guard.
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
  const original = cp[name];
  cp[name] = function(command, args, options, ...rest) {
    if (!Array.isArray(args)) { rest = options === undefined ? rest : [options, ...rest]; options = args; args = []; }
    if (typeof options === 'function') { rest.unshift(options); options = {}; }
    if (options?.execPath && options.execPath !== process.execPath) blocked();
    options = { ...options, env: { ...(options?.env || process.env), NODE_OPTIONS: preload } };
    if (name === 'fork') options.execArgv = [...(options.execArgv || process.execArgv).filter(x => !x.startsWith('--require=') && !x.startsWith('--import=')), preload];
    return original.call(this, command, args, options, ...rest);
  };
}
for (const name of ['exec', 'execSync']) {
  const original = cp[name];
  cp[name] = function(command, options, ...rest) {
    if (typeof options === 'function') { rest.unshift(options); options = {}; }
    return original.call(this, command, { ...options, env: { ...(options?.env || process.env), NODE_OPTIONS: preload } }, ...rest);
  };
}
const Worker = threads.Worker;
threads.Worker = class OfflineWorker extends Worker {
  constructor(filename, options = {}) {
    if (options.env === threads.SHARE_ENV) blocked();
    super(filename, { ...options, env: { ...(options.env || process.env), NODE_OPTIONS: preload },
      execArgv: [...(options.execArgv || process.execArgv).filter(x => !x.startsWith('--require=') && !x.startsWith('--import=')), preload] });
  }
};
syncBuiltinESMExports();

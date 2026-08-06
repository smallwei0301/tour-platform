import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../../src/lib/midao/inquiry-state-machine.mjs', import.meta.url);

async function loadStateMachine() {
  try {
    return await import(moduleUrl);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('inquiry state-machine module/behavior is absent');
    }
    throw error;
  }
}

const states = [
  'new',
  'opened',
  'replied',
  'ready_to_convert',
  'converted',
  'closed',
  'expired',
];

const allowedTransitions = [
  ['new', 'opened'],
  ['new', 'replied'],
  ['new', 'closed'],
  ['new', 'expired'],
  ['replied', 'ready_to_convert'],
  ['replied', 'converted'],
  ['replied', 'closed'],
  ['ready_to_convert', 'converted'],
  ['ready_to_convert', 'closed'],
];

const allowedTransitionKeys = new Set(
  allowedTransitions.map(([from, to]) => `${from}:${to}`),
);

test('allows every roadmap-authorized inquiry state transition', async () => {
  const { canTransitionInquiryState } = await loadStateMachine();

  for (const [from, to] of allowedTransitions) {
    assert.equal(canTransitionInquiryState(from, to), true, `${from} -> ${to}`);
  }
});

test('denies every unlisted transition between known inquiry states', async () => {
  const { canTransitionInquiryState } = await loadStateMachine();

  for (const from of states) {
    for (const to of states) {
      if (allowedTransitionKeys.has(`${from}:${to}`)) continue;
      assert.equal(canTransitionInquiryState(from, to), false, `${from} -> ${to}`);
    }
  }
});

test('denies unknown source and target inquiry states', async () => {
  const { canTransitionInquiryState } = await loadStateMachine();

  assert.equal(canTransitionInquiryState('unknown', 'new'), false);
  assert.equal(canTransitionInquiryState('new', 'unknown'), false);
  assert.equal(canTransitionInquiryState(null, 'new'), false);
  assert.equal(canTransitionInquiryState('new', null), false);
});

test('denies re-conversion from every terminal inquiry state', async () => {
  const { canTransitionInquiryState } = await loadStateMachine();

  for (const terminalState of ['converted', 'closed', 'expired']) {
    assert.equal(
      canTransitionInquiryState(terminalState, 'converted'),
      false,
      `${terminalState} must not convert again`,
    );
  }
});

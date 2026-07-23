import assert from 'node:assert/strict';

export function lexPostgresSql(sql) {
  const statements = [];
  let executable = '';
  let current = '';
  let state = 'normal';
  let dollarTag = '';
  let blockDepth = 0;

  const append = (text) => {
    executable += text;
    current += text;
  };
  const finishStatement = () => {
    const normalized = current.replace(/\s+/gu, ' ').trim().toUpperCase();
    if (normalized) statements.push(normalized);
    current = '';
    executable += ';';
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        append(char);
        state = 'normal';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'normal';
      } else if (char === '\n' || char === '\r') {
        append(char);
      }
      continue;
    }
    if (state === 'single-quote') {
      append(char);
      if (char === "'" && next === "'") {
        append(next);
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }
    if (state === 'double-quote') {
      append(char);
      if (char === '"' && next === '"') {
        append(next);
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        append(dollarTag);
        index += dollarTag.length - 1;
        state = 'normal';
      } else {
        append(char);
      }
      continue;
    }

    if (char === '-' && next === '-') {
      append(' ');
      state = 'line-comment';
      index += 1;
    } else if (char === '/' && next === '*') {
      append(' ');
      state = 'block-comment';
      blockDepth = 1;
      index += 1;
    } else if (char === "'") {
      append(char);
      state = 'single-quote';
    } else if (char === '"') {
      append(char);
      state = 'double-quote';
    } else if (char === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u);
      if (match) {
        dollarTag = match[0];
        append(dollarTag);
        index += dollarTag.length - 1;
        state = 'dollar-quote';
      } else {
        append(char);
      }
    } else if (char === ';') {
      finishStatement();
    } else {
      append(char);
    }
  }

  assert.ok(state === 'normal' || state === 'line-comment', `unterminated SQL ${state}`);
  const normalized = current.replace(/\s+/gu, ' ').trim().toUpperCase();
  if (normalized) statements.push(normalized);
  return { executable, statements };
}

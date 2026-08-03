const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const REQUEST_REF_PATTERN = new RegExp(`^(booking|inquiry)_(${UUID_PATTERN})$`);
const UUID_ONLY_PATTERN = new RegExp(`^${UUID_PATTERN}$`);
const REQUEST_KINDS = new Set(['booking', 'inquiry']);

export class InvalidRequestRefError extends TypeError {
  constructor() {
    super('Invalid request reference');
    this.name = 'InvalidRequestRefError';
    this.code = 'INVALID_REQUEST_REF';
  }
}

function rejectRequestRef() {
  throw new InvalidRequestRefError();
}

export function parseRequestRef(value) {
  if (typeof value !== 'string') rejectRequestRef();

  const match = REQUEST_REF_PATTERN.exec(value);
  if (!match) rejectRequestRef();

  return {
    kind: match[1],
    id: match[2].toLowerCase(),
  };
}

export function formatRequestRef(kind, id) {
  if (!REQUEST_KINDS.has(kind) || typeof id !== 'string' || !UUID_ONLY_PATTERN.test(id)) {
    rejectRequestRef();
  }

  return `${kind}_${id.toLowerCase()}`;
}

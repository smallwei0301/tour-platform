import { ok } from '../../../src/lib/api';
export async function GET() { return Response.json(ok([{ slug: 'chaishan-cave-tour' }])); }

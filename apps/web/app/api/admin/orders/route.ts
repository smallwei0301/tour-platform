import { ok } from '../../../../src/lib/api';
export async function GET() { return Response.json(ok([{ id: 'ord_demo_001', marginTwd: 650 }])); }

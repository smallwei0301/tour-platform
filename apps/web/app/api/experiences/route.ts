import { ok } from '../../../src/lib/api';
import { listExperiences } from '../../../src/lib/services.mjs';

export async function GET() {
  return Response.json(ok(listExperiences()));
}

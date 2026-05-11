import { revalidateTag } from 'next/cache';
import { ok, fail } from '../../../../../src/lib/api';
import { getAdminActivityByIdDb, updateActivityDb, deleteActivityDb } from '../../../../../src/lib/db.mjs';
import { buildFaqPatch, getFaqRevalidationTag } from '../../../../../src/lib/faq-route-helpers';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const data = await getAdminActivityByIdDb(id);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  // AC#4: Validate FAQ entries if present in the payload
  if (body.faq !== undefined) {
    const faqResult = buildFaqPatch(body.faq);
    if (faqResult.ok === false) {
      return Response.json(fail('VALIDATION_ERROR', faqResult.message), { status: 400 });
    }
    // Normalise to canonical {question, answer} shape before saving
    body.faq = faqResult.normalised;
  }

  try {
    const data = await updateActivityDb(id, body);
    if (!data) return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });

    // AC#5: Revalidate activity detail page cache after any update (including FAQ)
    if (data.slug) {
      revalidateTag(getFaqRevalidationTag(data.slug));
    }

    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await deleteActivityDb(id);
    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

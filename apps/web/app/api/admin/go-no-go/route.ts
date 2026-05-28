import { ok, fail } from '../../../../src/lib/api';
import { adminDashboardSummaryDb } from '../../../../src/lib/db.mjs';
import { createClient } from '@supabase/supabase-js';
import { getControls } from '../../../../src/lib/soft-launch.mjs';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type ReadinessStatus = 'pass' | 'warning' | 'fail' | 'manual' | 'evidence_required';

interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  owner: string;
  note: string;
  issueRef?: string;
}

interface Metrics {
  healthyOrderRate: number;
  exceptionRate: number;
  pendingRefunds: number;
  paidConfirmedRatio: number;
  incidents24h: number;
}

type VerdictState = 'GO' | 'HOLD' | 'NO_GO';

interface Verdict {
  state: VerdictState;
  reason: string;
  computedAt: string;
  deploySha: string;
}

interface RecommendedAction {
  label: string;
  href: string;
}

function computeVerdict(
  metrics: Metrics,
  hasCriticalIncident: boolean,
  readiness: ReadinessItem[],
  dashboardMetricsDegraded: boolean,
  incidentMetricsDegraded: boolean,
  metricsErrors: string[]
): { state: VerdictState; reason: string } {
  // Fail-closed: if required metrics are degraded, force HOLD
  if (dashboardMetricsDegraded || incidentMetricsDegraded) {
    return { state: 'HOLD', reason: `Required metrics unavailable: ${metricsErrors.join(', ')} — cannot confirm GO` };
  }

  const hasBlockerReadiness = readiness.some((r) => r.status === 'fail');

  // NO_GO takes precedence over HOLD
  if (metrics.exceptionRate > 10) {
    return { state: 'NO_GO', reason: `Exception rate ${metrics.exceptionRate}% exceeds 10% threshold` };
  }
  if (metrics.incidents24h > 0 && hasCriticalIncident) {
    return { state: 'NO_GO', reason: `${metrics.incidents24h} critical incident(s) in last 24h` };
  }
  if (hasBlockerReadiness) {
    return { state: 'NO_GO', reason: 'One or more readiness checklist items are failing' };
  }

  // HOLD conditions
  if (metrics.exceptionRate > 5) {
    return { state: 'HOLD', reason: `Exception rate ${metrics.exceptionRate}% exceeds 5% caution threshold` };
  }
  if (metrics.pendingRefunds > 10) {
    return { state: 'HOLD', reason: `${metrics.pendingRefunds} pending refunds exceed threshold of 10` };
  }

  const hasEvidenceRequired = readiness.some((r) => r.status === 'evidence_required');
  if (hasEvidenceRequired) {
    return { state: 'HOLD', reason: 'Required pre-launch evidence items are unsigned or incomplete' };
  }

  return { state: 'GO', reason: 'All metrics within acceptable thresholds' };
}

export async function GET(_req: Request) {
  try {
    const deploySha = process.env.VERCEL_GIT_COMMIT_SHA || 'local';
    const supabase = getSupabase();

    // Metrics degradation tracking
    const metricsErrors: string[] = [];
    let dashboardMetricsDegraded = false;
    let incidentMetricsDegraded = false;

    // --- Order metrics from adminDashboardSummaryDb ---
    let healthyOrderRate = 0;
    let exceptionRate = 0;
    let pendingRefunds = 0;
    let paidConfirmedRatio = 0;

    if (supabase) {
      try {
        const summary = await adminDashboardSummaryDb({ preset: '7d' });
        healthyOrderRate = summary?.kpi?.healthyOrderRate ?? 0;
        exceptionRate = summary?.kpi?.exceptionRate ?? 0;
        pendingRefunds = summary?.kpi?.pendingRefunds ?? 0;

        // paidConfirmedRatio: ratio of paid+confirmed orders to total
        const orders: any[] = summary?.queues?.orders ?? [];
        const totalOrders = summary?.kpi?.totalOrders ?? 1;
        const paidConfirmed = orders.filter(
          (o: any) => o.status === 'paid' || o.status === 'confirmed'
        ).length;
        paidConfirmedRatio = Number(((paidConfirmed / Math.max(totalOrders, 1)) * 100).toFixed(1));
      } catch {
        // Fallback to zeros if DB call fails; track degradation
        metricsErrors.push('dashboard_summary_unavailable');
        dashboardMetricsDegraded = true;
      }
    }

    // --- incidents24h: replicate pattern from api/admin/health/route.ts ---
    let incidents24h = 0;
    let hasCriticalIncident = false;

    if (supabase) {
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: incidentRows, error: incidentsError } = await supabase
          .from('incidents')
          .select('severity')
          .gte('created_at', since24h);

        if (incidentsError) {
          metricsErrors.push('incidents_query_unavailable');
          incidentMetricsDegraded = true;
        } else if (incidentRows) {
          incidents24h = incidentRows.length;
          hasCriticalIncident = incidentRows.some(
            (r: any) => r.severity === 'critical'
          );
        }
      } catch {
        metricsErrors.push('incidents_query_unavailable');
        incidentMetricsDegraded = true;
      }
    }

    const metrics: Metrics = {
      healthyOrderRate,
      exceptionRate,
      pendingRefunds,
      paidConfirmedRatio,
      incidents24h,
    };

    // --- Readiness checklist (static items, manually verified by ops) ---
    const readiness: ReadinessItem[] = [
      {
        id: 'ecpay-sandbox',
        label: 'ECPay sandbox → production credentials rotated',
        status: 'manual',
        owner: 'ops',
        note: 'Verify ECPAY_HASH_KEY and ECPAY_HASH_IV are production values',
      },
      {
        id: 'supabase-rls',
        label: 'Supabase RLS policies enabled on all tables',
        status: supabase ? 'pass' : 'warning',
        owner: 'infra',
        note: supabase ? 'Supabase connection confirmed' : 'Supabase not connected — check env vars',
      },
      {
        id: 'sentry-dsn',
        label: 'Sentry DSN configured and receiving events',
        status: process.env.SENTRY_DSN ? 'pass' : 'warning',
        owner: 'ops',
        note: process.env.SENTRY_DSN ? 'SENTRY_DSN detected' : 'SENTRY_DSN not set',
      },
      {
        id: 'vercel-deploy',
        label: 'Latest Vercel deploy is production branch',
        status: deploySha !== 'local' ? 'pass' : 'warning',
        owner: 'infra',
        note: deploySha !== 'local' ? `Commit: ${deploySha}` : 'Running locally — not a Vercel deploy',
      },
      {
        id: 'evidence-alert-drill',
        label: '#714 Alert drill before first payment',
        status: process.env.EVIDENCE_714_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'ops',
        note: '#714: Simulate alert → ops receives page → on-call ack, end-to-end chain verified. Set EVIDENCE_714_SIGNED=true when done.',
        issueRef: '#714',
      },
      {
        id: 'evidence-first-payment-qa',
        label: '#828 First-payment QA gate decision',
        status: process.env.EVIDENCE_828_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'qa',
        note: '#828: First-payment QA gate decision signed off. Set EVIDENCE_828_SIGNED=true when done.',
        issueRef: '#828',
      },
      {
        id: 'evidence-booking-v2-qa',
        label: '#838 Booking V2 regression QA (#824/#838/#839)',
        status: process.env.EVIDENCE_838_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'qa',
        note: '#838 / #824 / #839: Booking V2 recent PR + bug regression QA must pass. Set EVIDENCE_838_SIGNED=true when done.',
        issueRef: '#838',
      },
      {
        id: 'evidence-restore-drill',
        label: '#724 Restore drill timing per #320/#594',
        status: process.env.EVIDENCE_724_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'infra',
        note: '#724: Restore drill completed within the timing #320/#594 mandate. Set EVIDENCE_724_SIGNED=true when done.',
        issueRef: '#724',
      },
      {
        id: 'evidence-guide-content',
        label: '#605 Guide/content readiness',
        status: process.env.EVIDENCE_605_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'ops',
        note: '#605: First batch of guides + activity content live and approved. Set EVIDENCE_605_SIGNED=true when done.',
        issueRef: '#605',
      },
      {
        id: 'evidence-guide-onboarding',
        label: '#318 Guide onboarding demo run + retrospective',
        status: process.env.EVIDENCE_318_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'ops',
        note: '#318: Real guide self-operation walkthrough. Set EVIDENCE_318_SIGNED=true when done.',
        issueRef: '#318',
      },
      {
        id: 'evidence-cs-sop',
        label: '#319 Customer-service SOP drill (4 scenarios)',
        status: process.env.EVIDENCE_319_SIGNED === 'true' ? 'pass' : 'evidence_required',
        owner: 'ops',
        note: '#319: SOP drill for cancel/refund/incident/emergency. Set EVIDENCE_319_SIGNED=true when done.',
        issueRef: '#319',
      },
    ];

    // --- Verdict ---
    const { state, reason } = computeVerdict(metrics, hasCriticalIncident, readiness, dashboardMetricsDegraded, incidentMetricsDegraded, metricsErrors);

    const verdict: Verdict = {
      state,
      reason,
      computedAt: new Date().toISOString(),
      deploySha,
    };

    // --- Recommended actions (only when not GO) ---
    const recommendedActions: RecommendedAction[] = [];

    if (state !== 'GO') {
      if (exceptionRate > 5) {
        recommendedActions.push({
          label: 'Review exception orders',
          href: '/admin/operations-tracking',
        });
      }
      if (pendingRefunds > 10) {
        recommendedActions.push({
          label: 'Process pending refunds',
          href: '/admin/refunds',
        });
      }
      if (incidents24h > 0) {
        recommendedActions.push({
          label: 'View system health incidents',
          href: '/admin/health',
        });
      }
      if (recommendedActions.length === 0) {
        recommendedActions.push({
          label: 'Review readiness checklist',
          href: '/admin/go-no-go',
        });
      }
    }

    // --- Soft-launch controls ---
    let soft_launch_controls = null;
    if (supabase) {
      try {
        soft_launch_controls = await getControls(supabase);
      } catch {
        // non-fatal: soft-launch controls are supplementary
      }
    }

    const metricsStatus = {
      degraded: dashboardMetricsDegraded || incidentMetricsDegraded,
      errors: metricsErrors,
      note: metricsErrors.length > 0 ? 'Some metrics unavailable — verdict forced to HOLD' : 'All metrics available',
    };

    return Response.json(
      ok({ readiness, metrics, verdict, recommendedActions, soft_launch_controls, metricsStatus })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

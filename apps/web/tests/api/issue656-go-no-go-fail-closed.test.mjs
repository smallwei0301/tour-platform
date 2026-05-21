/**
 * Issue #656 — Go/No-Go fail-closed contract tests
 *
 * Static tests verifying that the go-no-go route:
 * 1. Tracks dashboardMetricsDegraded / metricsErrors
 * 2. computeVerdict checks for degraded metrics before other logic
 * 3. Returns HOLD when metrics are degraded
 * 4. Includes metricsStatus in response
 * 5. Sets degradation flag when incidents query fails
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(
  __dirname,
  '../../app/api/admin/go-no-go/route.ts'
);

const source = readFileSync(routePath, 'utf-8');

describe('issue #656 — go-no-go fail-closed', () => {
  it('route declares dashboardMetricsDegraded tracking variable', () => {
    assert.ok(
      source.includes('dashboardMetricsDegraded'),
      'Expected dashboardMetricsDegraded to be declared in route'
    );
  });

  it('route declares metricsErrors tracking array', () => {
    assert.ok(
      source.includes('metricsErrors'),
      'Expected metricsErrors array to be declared in route'
    );
  });

  it('route declares incidentMetricsDegraded tracking variable', () => {
    assert.ok(
      source.includes('incidentMetricsDegraded'),
      'Expected incidentMetricsDegraded to be declared in route'
    );
  });

  it('computeVerdict signature accepts dashboardMetricsDegraded parameter', () => {
    assert.ok(
      source.includes('dashboardMetricsDegraded: boolean'),
      'Expected computeVerdict to accept dashboardMetricsDegraded: boolean parameter'
    );
  });

  it('computeVerdict checks for degraded metrics before other verdict logic', () => {
    const fnStart = source.indexOf('function computeVerdict(');
    assert.ok(fnStart !== -1, 'computeVerdict function not found');

    const degradedCheck = source.indexOf('dashboardMetricsDegraded || incidentMetricsDegraded', fnStart);
    assert.ok(degradedCheck !== -1, 'Expected degraded metrics check inside computeVerdict');

    const noGoCheck = source.indexOf('NO_GO', fnStart);
    assert.ok(
      degradedCheck < noGoCheck,
      'Degraded metrics check must appear before NO_GO conditions in computeVerdict'
    );
  });

  it('computeVerdict returns HOLD when metrics are degraded', () => {
    // Verify the degraded path forces state to HOLD (not NO_GO or GO)
    const degradedHoldPattern = /dashboardMetricsDegraded \|\| incidentMetricsDegraded[\s\S]*?state: 'HOLD'/;
    assert.ok(
      degradedHoldPattern.test(source),
      'Expected computeVerdict to return HOLD state when metrics are degraded'
    );
  });

  it('computeVerdict includes metricsErrors in degraded HOLD reason', () => {
    assert.ok(
      source.includes("metricsErrors.join(', ')"),
      'Expected degraded HOLD reason to include joined metricsErrors'
    );
  });

  it('dashboard summary catch block sets dashboardMetricsDegraded = true', () => {
    assert.ok(
      source.includes('dashboard_summary_unavailable'),
      'Expected catch block to push dashboard_summary_unavailable to metricsErrors'
    );
    // Verify dashboardMetricsDegraded = true appears in catch context (after the string)
    const catchIdx = source.indexOf('dashboard_summary_unavailable');
    const degradedSetIdx = source.indexOf('dashboardMetricsDegraded = true', catchIdx - 50);
    assert.ok(
      degradedSetIdx !== -1 && degradedSetIdx < catchIdx + 100,
      'Expected dashboardMetricsDegraded = true near dashboard_summary_unavailable error push'
    );
  });

  it('incidents error path sets incidentMetricsDegraded flag', () => {
    assert.ok(
      source.includes('incidents_query_unavailable'),
      'Expected incidents error to push incidents_query_unavailable to metricsErrors'
    );
    assert.ok(
      source.includes('incidentMetricsDegraded = true'),
      'Expected incidentMetricsDegraded = true to be set on incidents failure'
    );
  });

  it('incidents query checks for supabase error object', () => {
    assert.ok(
      source.includes('incidentsError'),
      'Expected incidents query to destructure and check error from supabase response'
    );
  });

  it('route includes metricsStatus in response payload', () => {
    assert.ok(
      source.includes('metricsStatus'),
      'Expected metricsStatus to appear in response payload'
    );
  });

  it('metricsStatus has degraded field', () => {
    assert.ok(
      source.includes('degraded: dashboardMetricsDegraded || incidentMetricsDegraded'),
      'Expected metricsStatus.degraded to be computed from degradation flags'
    );
  });

  it('metricsStatus has errors field', () => {
    assert.ok(
      source.includes('errors: metricsErrors'),
      'Expected metricsStatus.errors to reference metricsErrors array'
    );
  });

  it('metricsStatus has note field with meaningful message', () => {
    assert.ok(
      source.includes('Some metrics unavailable — verdict forced to HOLD'),
      'Expected metricsStatus.note to explain HOLD when metrics unavailable'
    );
    assert.ok(
      source.includes('All metrics available'),
      'Expected metricsStatus.note to confirm availability when no errors'
    );
  });
});

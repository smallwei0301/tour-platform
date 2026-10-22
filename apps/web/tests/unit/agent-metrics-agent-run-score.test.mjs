import { describe, it } from 'node:test';
import { expect } from '../helpers/vitest-expect.mjs';

import { createRunLedger, validateRunLedger } from "../../../../scripts/agents/run-ledger.mjs";
import {
  computeDeliveryUnits,
  computeWeightedUsage,
  renderMarkdown,
  scoreRun,
} from "../../../../scripts/agents/score-run.mjs";

function healthyRun() {
  const run = createRunLedger("2026-09-01-healthy", "2026-09-01T00:00:00Z");
  run.status = "COMPLETE";
  run.endedAt = "2026-09-01T02:00:00Z";
  run.main = { startSha: "a", endSha: "b" };
  run.inventory = {
    openIssuesStart: 10,
    openIssuesEnd: 9,
    openPrsStart: 4,
    openPrsEnd: 3,
    mainTerraPeak: 1,
    reserveTerraPeak: 1,
    activeCandidatePeak: 2,
    sharedTestPeak: 1,
    closureSweeps: 1,
    closureAdvancedOrClosed: 1,
  };
  run.modelUsage.tasks = [
    { id: "l1", requestedModel: "luna", actualModel: "luna", role: "truth", count: 4, contextClass: "compact", accepted: true, inputTokens: null, outputTokens: null, cachedTokens: null },
    { id: "t1", requestedModel: "terra", actualModel: "terra", role: "build", count: 1, contextClass: "medium", accepted: true, inputTokens: null, outputTokens: null, cachedTokens: null },
    { id: "s1", requestedModel: "sol", actualModel: "sol", role: "audit", count: 2, contextClass: "compact", accepted: true, inputTokens: null, outputTokens: null, cachedTokens: null },
  ];
  run.modelUsage.weightedUsageImprovementPercent = 20;
  run.delivery = {
    issuesStarted: 1,
    issuesClosed: 1,
    auditReady: 0,
    ownerBlockedComplete: 0,
    exactHeadCiOnly: 0,
    commitOnly: 0,
    unfinishedCarryover: 0,
    cycleTimeMinutes: 120,
  };
  run.ci = { fullCiRuns: 1, invalidReruns: 0, firstPassRatePercent: 100, sharedTestCollisions: 0 };
  run.quality = {
    acceptanceEvidenceCoveragePercent: 100,
    auditFirstPassRatePercent: 100,
    unresolvedP0: 0,
    unresolvedP1: 0,
    reopenedIssues: 0,
    postMergeRegressions: 0,
    safetyViolations: 0,
    hardFailReasons: [],
  };
  run.flow = {
    lunaTasks: 4,
    lunaAccepted: 4,
    lunaDelegationRatePercent: 80,
    duplicateAgentTasks: 0,
    ownershipCollisions: 0,
    waitTimeConvertedPercent: 100,
    solTouches: 2,
    solIssues: 1,
  };
  run.auditability = {
    evidenceFieldsCompletePercent: 100,
    exactHeadTestCoveragePercent: 100,
    stalePendingDescriptions: 0,
    preciseBlockersPercent: 100,
    scoreInputsCompletePercent: 100,
  };
  return run;
}

describe("B+ run ledger", () => {
  it("creates a valid empty ledger", () => {
    const run = createRunLedger("2026-09-01-empty");
    expect(validateRunLedger(run)).toEqual([]);
  });

  it("rejects impossible Luna adoption counts", () => {
    const run = createRunLedger("2026-09-01-invalid");
    run.flow.lunaTasks = 1;
    run.flow.lunaAccepted = 2;
    expect(validateRunLedger(run)).toContain("flow.lunaAccepted cannot exceed flow.lunaTasks");
  });
});

describe("B+ score", () => {
  it("weights Luna lower than Terra and Sol and includes context size", () => {
    const run = healthyRun();
    expect(computeWeightedUsage(run)).toEqual({ weightedUsageUnits: 20.5, actualTokens: null, unverifiedModelTasks: 0 });
  });

  it("computes delivery units from actual exit states", () => {
    const run = healthyRun();
    run.delivery = {
      ...run.delivery,
      issuesClosed: 1,
      auditReady: 1,
      ownerBlockedComplete: 1,
      exactHeadCiOnly: 1,
      commitOnly: 1,
    };
    expect(computeDeliveryUnits(run)).toBe(2.65);
  });

  it("gives a healthy B+ run an A and a reproducible report", () => {
    const run = healthyRun();
    const result = scoreRun(run);
    expect(result.qualified).toBe(true);
    expect(result.grade).toBe("A");
    expect(result.total).toBeGreaterThanOrEqual(90);
    expect(renderMarkdown(run, result)).toContain("B+ Agent Run 報告");
  });

  it("hard-fails a safety violation regardless of other scores", () => {
    const run = healthyRun();
    run.quality.safetyViolations = 1;
    run.quality.hardFailReasons = ["unauthorized production DML"];
    const result = scoreRun(run);
    expect(result.qualified).toBe(false);
    expect(result.grade).toBe("F-HARD");
  });

  it("recommends Closure Recovery when no deliverable exits", () => {
    const run = healthyRun();
    run.delivery.issuesClosed = 0;
    run.delivery.ownerBlockedComplete = 0;
    run.delivery.auditReady = 0;
    run.delivery.unfinishedCarryover = 2;
    const result = scoreRun(run);
    expect(result.recommendations.some((item) => item.includes("Closure Recovery"))).toBe(true);
  });
});

// review-runs.mjs（跨 Run 復盤比較）未移植；原 "B+ retrospective" 案例隨之略過。

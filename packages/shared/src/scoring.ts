import type { FindingCheck, ReportScore, ScoreBreakdownCategory, CheckStatus } from './types.js';

export const METHODOLOGY_VERSION = '1.0.0';

export interface ScoreCategoryDefinition {
  key: string;
  name: string;
  weight: number;
  checkKeys: string[];
}

export const SCORE_CATEGORIES: ScoreCategoryDefinition[] = [
  {
    key: 'spf',
    name: 'SPF policy & lookup budget',
    weight: 20,
    checkKeys: ['spf_record', 'spf_auth', 'spf_lookup_budget']
  },
  {
    key: 'dkim',
    name: 'DKIM observed pass & selector DNS',
    weight: 20,
    checkKeys: ['dkim_signature', 'dkim_selector']
  },
  {
    key: 'dmarc',
    name: 'DMARC policy & authentication',
    weight: 25,
    checkKeys: ['dmarc_record', 'dmarc_auth']
  },
  {
    key: 'alignment',
    name: 'SPF / DKIM alignment to From header',
    weight: 15,
    checkKeys: ['alignment']
  },
  {
    key: 'transport',
    name: 'Transport & TLS evidence',
    weight: 8,
    checkKeys: ['tls_evidence', 'received_chain']
  },
  {
    key: 'unsubscribe',
    name: 'List-Unsubscribe hygiene',
    weight: 5,
    checkKeys: ['list_unsubscribe', 'one_click_unsubscribe']
  },
  {
    key: 'structure',
    name: 'Message structure & RFC5322 headers',
    weight: 7,
    checkKeys: ['mx_records', 'message_structure']
  }
];

export function calculateReportScore(checks: FindingCheck[]): ReportScore {
  const checkMap = new Map<string, FindingCheck>();
  let passedCount = 0;
  let warningsCount = 0;
  let failedCount = 0;
  let unknownCount = 0;

  for (const check of checks) {
    checkMap.set(check.key, check);
    switch (check.status) {
      case 'pass':
        passedCount++;
        break;
      case 'warning':
        warningsCount++;
        break;
      case 'fail':
        failedCount++;
        break;
      case 'unknown':
        unknownCount++;
        break;
    }
  }

  const breakdown: ScoreBreakdownCategory[] = [];
  let totalEvaluatedWeight = 0;
  let totalEarnedPoints = 0;

  for (const cat of SCORE_CATEGORIES) {
    const catChecks = cat.checkKeys
      .map(k => checkMap.get(k))
      .filter((c): c is FindingCheck => c !== undefined);

    if (catChecks.length === 0) {
      // No checks available for this category -> unknown
      breakdown.push({
        key: cat.key,
        name: cat.name,
        weight: cat.weight,
        earned: 0,
        status: 'unknown',
        unknownDeduction: true
      });
      continue;
    }

    // Determine category status & score multiplier
    const hasFail = catChecks.some(c => c.status === 'fail');
    const hasWarn = catChecks.some(c => c.status === 'warning');
    const allPass = catChecks.every(c => c.status === 'pass');
    const allUnknown = catChecks.every(c => c.status === 'unknown');

    let catStatus: CheckStatus = 'unknown';
    let earnedRatio = 0;

    if (allUnknown) {
      catStatus = 'unknown';
      earnedRatio = 0;
    } else {
      // Filter out pure unknown checks within category to evaluate known checks
      const knownChecks = catChecks.filter(c => c.status !== 'unknown');
      const passFraction = knownChecks.filter(c => c.status === 'pass').length / knownChecks.length;
      const warnFraction = knownChecks.filter(c => c.status === 'warning').length / knownChecks.length;
      
      // Known checks contribute to evaluated weight
      const evaluatedRatio = knownChecks.length / catChecks.length;
      const catEvaluatedWeight = cat.weight * evaluatedRatio;
      totalEvaluatedWeight += catEvaluatedWeight;

      if (hasFail) {
        catStatus = 'fail';
        // Fails in critical categories receive severe penalty
        earnedRatio = Math.max(0, (passFraction * 0.4) + (warnFraction * 0.2));
      } else if (hasWarn) {
        catStatus = 'warning';
        earnedRatio = (passFraction * 1.0) + (warnFraction * 0.6);
      } else if (allPass) {
        catStatus = 'pass';
        earnedRatio = 1.0;
      } else {
        catStatus = 'pass';
        earnedRatio = passFraction;
      }

      totalEarnedPoints += catEvaluatedWeight * earnedRatio;
    }

    breakdown.push({
      key: cat.key,
      name: cat.name,
      weight: cat.weight,
      earned: Math.round(cat.weight * earnedRatio * 10) / 10,
      status: catStatus,
      unknownDeduction: allUnknown || catChecks.some(c => c.status === 'unknown')
    });
  }

  // Coverage is evaluatedWeight / totalWeight(100)
  const coveragePercent = Math.min(100, Math.max(0, Math.round(totalEvaluatedWeight)));
  
  // Normalized score: if coverage > 0, scale earned points to 100-base
  const rawScore = totalEvaluatedWeight > 0 ? (totalEarnedPoints / totalEvaluatedWeight) * 100 : 0;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  return {
    score,
    coveragePercent,
    passedCount,
    warningsCount,
    failedCount,
    unknownCount,
    methodologyVersion: METHODOLOGY_VERSION,
    breakdown
  };
}

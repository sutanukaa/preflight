import crypto from 'node:crypto';
import { db } from '../db/db.js';
import { calculateReportScore, type FindingCheck, type Report } from '@preflight/shared';

export class ReportService {
  /**
   * Builds, scores, and persists a report for a domain given a list of checks.
   */
  async buildAndSaveReport(options: {
    domainId: string;
    domainName: string;
    inboundMessageId?: string | null;
    checks: FindingCheck[];
  }): Promise<Report> {
    const scoreResult = calculateReportScore(options.checks);
    const reportId = 'rep_' + crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();

    let summary = `Report score: ${scoreResult.score}/100 with ${scoreResult.coveragePercent}% evidence coverage.`;
    if (scoreResult.failedCount > 0) {
      summary += ` ${scoreResult.failedCount} critical blocker(s) detected.`;
    } else if (scoreResult.warningsCount > 0) {
      summary += ` ${scoreResult.warningsCount} warning(s) need attention.`;
    } else {
      summary += ' All evaluated authentication checks passed.';
    }

    const report: Report = {
      id: reportId,
      domainId: options.domainId,
      domainName: options.domainName,
      inboundMessageId: options.inboundMessageId || null,
      score: scoreResult.score,
      coveragePercent: scoreResult.coveragePercent,
      methodologyVersion: scoreResult.methodologyVersion,
      summary,
      checks: options.checks,
      createdAt: now
    };

    await db.saveReport({
      id: report.id,
      domain_id: report.domainId,
      inbound_message_id: report.inboundMessageId,
      score: report.score,
      coverage_percent: report.coveragePercent,
      methodology_version: report.methodologyVersion,
      summary: report.summary,
      checks: report.checks
    });

    return report;
  }
}

export const reportService = new ReportService();

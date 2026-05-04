'use client';

import type { AnalysisResponse, FieldResult, ComplianceFlag, AdvisoryStatus } from '@/types/cola';
import FieldBadge from './FieldBadge';

interface ResultsCardProps {
  result: AnalysisResponse;
  onReset: () => void;
}

const OVERALL_CONFIG = {
  PASS: {
    bg: 'bg-green-50 border-green-400',
    icon: '✓',
    iconBg: 'bg-green-500',
    title: 'All Clear — Label Approved',
    description: 'All fields match the application and meet COLA requirements.',
  },
  FAIL: {
    bg: 'bg-red-50 border-red-400',
    icon: '✗',
    iconBg: 'bg-red-500',
    title: 'Issues Found — Label Not Approved',
    description: 'One or more fields failed verification. Review the details below.',
  },
  REVIEW: {
    bg: 'bg-yellow-50 border-yellow-400',
    icon: '!',
    iconBg: 'bg-yellow-500',
    title: 'Manual Review Recommended',
    description: 'Some fields have minor discrepancies that may require agent review.',
  },
};

// Visual treatment per advisory severity. Kept distinct from FieldBadge styling
// so the advisories section reads as a separate concern from cross-validation.
const ADVISORY_CONFIG: Record<
  AdvisoryStatus,
  { accent: string; iconBg: string; icon: string; label: string }
> = {
  info: {
    accent: 'border-l-4 border-blue-300 bg-blue-50',
    iconBg: 'bg-blue-500',
    icon: 'i',
    label: 'Info',
  },
  warning: {
    accent: 'border-l-4 border-yellow-400 bg-yellow-50',
    iconBg: 'bg-yellow-500',
    icon: '!',
    label: 'Warning',
  },
  'review-required': {
    accent: 'border-l-4 border-orange-400 bg-orange-50',
    iconBg: 'bg-orange-500',
    icon: '?',
    label: 'Review Required',
  },
};

function AdvisoryRow({ advisory }: { advisory: ComplianceFlag }) {
  const cfg = ADVISORY_CONFIG[advisory.severity];
  return (
    <div className={`rounded-lg p-4 ${cfg.accent}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-7 h-7 rounded-full ${cfg.iconBg} text-white text-sm font-bold flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-base">{advisory.title}</span>
            <span className="text-xs uppercase tracking-wide text-gray-500">{cfg.label}</span>
          </div>
          <p className="text-sm text-gray-700 mt-1">{advisory.detail}</p>
          <p className="text-xs text-gray-500 italic mt-1">{advisory.cfrReference}</p>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ field }: { field: FieldResult }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <FieldBadge status={field.status} size="sm" />
            <span className="font-semibold text-gray-800 text-base">{field.label}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Application says</span>
              <span className="text-gray-900 wrap-break-word">{field.submitted || <em className="text-gray-400">Not provided</em>}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Label shows</span>
              <span className={`wrap-break-word ${field.extracted ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                {field.extracted ?? 'Not found on label'}
              </span>
            </div>
          </div>

          {field.note && (
            <p className={`mt-2 text-sm rounded px-3 py-2 ${
              field.status === 'fail'
                ? 'bg-red-50 text-red-700'
                : field.status === 'warning'
                ? 'bg-yellow-50 text-yellow-700'
                : 'bg-blue-50 text-blue-700'
            }`}>
              {field.note}
            </p>
          )}

          {field.complianceNote && (
            <p className="mt-1 text-xs text-gray-500 italic">{field.complianceNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResultsCard({ result, onReset }: ResultsCardProps) {
  const cfg = OVERALL_CONFIG[result.overallStatus];
  const failCount = result.fields.filter((f) => f.status === 'fail').length;
  const passCount = result.fields.filter((f) => f.status === 'pass').length;
  const warnCount = result.fields.filter((f) => f.status === 'warning').length;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Overall status banner */}
      <div className={`border-2 rounded-xl p-6 ${cfg.bg}`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full ${cfg.iconBg} flex items-center justify-center shrink-0`}>
            <span className="text-white text-2xl font-bold">{cfg.icon}</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{cfg.title}</h2>
            <p className="text-gray-600 mt-0.5">{cfg.description}</p>
          </div>
        </div>

        {/* Summary counts */}
        <div className="flex gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            <span className="text-gray-700">{passCount} passed</span>
          </div>
          {warnCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
              <span className="text-gray-700">{warnCount} need review</span>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="text-gray-700">{failCount} failed</span>
            </div>
          )}
          <div className="ml-auto text-xs text-gray-400">
            Processed in {result.processingMs}ms
          </div>
        </div>
      </div>

      {/* Per-field results */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Field-by-Field Results</h3>
        <div className="space-y-3">
          {result.fields.map((field) => (
            <FieldRow key={field.field} field={field} />
          ))}
        </div>
      </div>

      {/* Compliance advisories — informational only; never affects the headline verdict.
          Section is omitted entirely when there are no advisories (the presence of the
          section is the signal). */}
      {result.advisories.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">
            Compliance Advisories ({result.advisories.length})
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            TTB rule observations on the label itself. These do not affect the verdict above —
            review them at your discretion.
          </p>
          <div className="space-y-3">
            {result.advisories.map((advisory) => (
              <AdvisoryRow key={advisory.id} advisory={advisory} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onReset}
          className="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors"
        >
          Review Another Label
        </button>
        <button
          onClick={() => window.print()}
          className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-base transition-colors"
        >
          Print Results
        </button>
      </div>
    </div>
  );
}

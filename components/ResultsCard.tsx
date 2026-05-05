'use client';

import { useState } from 'react';
import type {
  AnalysisResponse,
  FieldResult,
  ComplianceFlag,
  AdvisoryStatus,
  COLAField,
} from '@/types/cola';
import LabelModal from './LabelModal';

interface ResultsCardProps {
  result: AnalysisResponse;
  imageUrl: string | null;
  onReset: () => void;
}

const OVERALL_PILL = {
  PASS: { dot: 'bg-green-500', text: 'Approved', textClass: 'text-green-700' },
  REVIEW: { dot: 'bg-yellow-500', text: 'Needs review', textClass: 'text-yellow-700' },
  FAIL: { dot: 'bg-red-500', text: 'Failed', textClass: 'text-red-700' },
};

// Visual treatment per status — accent bar (left edge of card) + status pill.
const STATUS_STYLES = {
  pass: {
    accent: 'bg-green-500',
    pill: 'border-green-300 text-green-700 bg-green-50',
    pillIcon: '✓',
    pillLabel: 'PASS',
    note: 'bg-transparent text-gray-600 border-t border-gray-100',
  },
  warning: {
    accent: 'bg-yellow-500',
    pill: 'border-yellow-300 text-yellow-700 bg-yellow-50',
    pillIcon: '⚠',
    pillLabel: 'REVIEW',
    note: 'bg-transparent text-gray-700 border-t border-gray-100 italic',
  },
  fail: {
    accent: 'bg-red-500',
    pill: 'border-red-300 text-red-700 bg-red-50',
    pillIcon: '✗',
    pillLabel: 'FAIL',
    note: 'bg-transparent text-gray-700 border-t border-gray-100 italic',
  },
  missing: {
    accent: 'bg-gray-400',
    pill: 'border-gray-300 text-gray-700 bg-gray-50',
    pillIcon: '?',
    pillLabel: 'MISSING',
    note: 'bg-transparent text-gray-600 border-t border-gray-100',
  },
} as const;

const ADVISORY_CONFIG: Record<
  AdvisoryStatus,
  { accent: string; iconBg: string; icon: string; label: string }
> = {
  info: { accent: 'border-l-4 border-blue-300 bg-blue-50', iconBg: 'bg-blue-500', icon: 'i', label: 'Info' },
  warning: { accent: 'border-l-4 border-yellow-400 bg-yellow-50', iconBg: 'bg-yellow-500', icon: '!', label: 'Warning' },
  'review-required': { accent: 'border-l-4 border-orange-400 bg-orange-50', iconBg: 'bg-orange-500', icon: '?', label: 'Review Required' },
};

// Field display order on the results page. Net Contents is included even
// though the user's verbatim list omitted it — it's a 27 CFR Part 5.53
// required field, so it stays visible. Country of Origin only renders when
// the application was flagged as imported.
const FIELD_ORDER: COLAField[] = [
  'brand_name',
  'class_type',
  'abv',
  'net_contents',
  'bottler_name',
  'bottler_address',
  'country_of_origin',
  'government_warning',
];

function FieldCard({ field }: { field: FieldResult }) {
  const styles = STATUS_STYLES[field.status];
  return (
    <div className="relative rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-1 ${styles.accent}`} aria-hidden="true" />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-900">{field.label}</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-md border text-xs font-semibold px-2 py-0.5 ${styles.pill}`}
            role="status"
          >
            <span aria-hidden="true">{styles.pillIcon}</span>
            {styles.pillLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-sm">
          <div>
            <p className="text-[11px] font-medium tracking-wider text-gray-500 uppercase mb-0.5">
              Expected
            </p>
            <p className="text-gray-900 wrap-break-word">
              {field.submitted || <em className="text-gray-400">Not provided</em>}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wider text-gray-500 uppercase mb-0.5">
              Detected
            </p>
            <p className={`wrap-break-word ${field.extracted ? 'text-gray-900' : 'text-gray-400 italic'}`}>
              {field.extracted ?? 'Not found on label'}
            </p>
          </div>
        </div>

        {field.note && field.status !== 'pass' && (
          <p className={`mt-3 pt-3 text-sm ${styles.note}`}>{field.note}</p>
        )}
      </div>
    </div>
  );
}

function AdvisoryRow({ advisory }: { advisory: ComplianceFlag }) {
  const cfg = ADVISORY_CONFIG[advisory.severity];
  return (
    <div className={`rounded-md p-4 ${cfg.accent}`}>
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

export default function ResultsCard({ result, imageUrl, onReset }: ResultsCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const passCount = result.fields.filter((f) => f.status === 'pass').length;
  const warnCount = result.fields.filter((f) => f.status === 'warning').length;
  const failCount = result.fields.filter((f) => f.status === 'fail').length;
  const overall = OVERALL_PILL[result.overallStatus];

  const orderedFields = FIELD_ORDER
    .map((key) => result.fields.find((f) => f.field === key))
    .filter((f): f is FieldResult => Boolean(f));

  return (
    <div className="min-h-screen bg-slate-200/60 px-6 py-6">
      <div className="max-w-7xl mx-auto bg-slate-100 border border-slate-300/70 rounded-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-300/70">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Verification Results</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`flex items-center gap-1.5 text-sm font-medium ${overall.textClass}`}>
                <span className={`w-2 h-2 rounded-full ${overall.dot}`} aria-hidden="true" />
                {overall.text}
              </span>
              <span className="text-gray-300">·</span>
              <span className="inline-flex items-center rounded-md border border-green-300 bg-green-50 text-green-700 text-xs font-semibold px-2 py-0.5">
                {passCount} PASS
              </span>
              <span className="inline-flex items-center rounded-md border border-yellow-300 bg-yellow-50 text-yellow-700 text-xs font-semibold px-2 py-0.5">
                {warnCount} REVIEW
              </span>
              <span className="inline-flex items-center rounded-md border border-red-300 bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5">
                {failCount} FAIL
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-sm text-gray-700 font-medium transition-colors"
            >
              Print
            </button>
            <button
              type="button"
              // CSV export wiring is a follow-up — left in place for layout fidelity
              // and so the contract is set when the export pipeline lands.
              onClick={() => {}}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-sm text-gray-700 font-medium transition-colors"
              title="Export CSV (coming soon)"
              disabled
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={onReset}
              className="px-3 py-1.5 rounded-md bg-blue-900 hover:bg-blue-950 text-sm text-white font-medium transition-colors"
            >
              New scan
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-6 py-6">
          <div className="space-y-3">
            {orderedFields.map((field) => (
              <FieldCard key={field.field} field={field} />
            ))}

            {result.advisories.length > 0 && (
              <div className="pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Compliance Advisories ({result.advisories.length})
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  TTB rule observations on the label itself. These do not affect the verdict above.
                </p>
                <div className="space-y-3">
                  {result.advisories.map((a) => (
                    <AdvisoryRow key={a.id} advisory={a} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right rail — submitted label */}
          <aside>
            <p className="text-[11px] font-medium tracking-wider text-gray-500 uppercase mb-2">
              Submitted Label
            </p>
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="block w-full rounded-md border border-gray-300 bg-white overflow-hidden hover:border-blue-400 hover:shadow transition-all p-2"
                aria-label="Enlarge submitted label image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Submitted label"
                  className="w-full h-40 object-contain"
                />
              </button>
            ) : (
              <div className="w-full h-40 rounded-md border border-gray-300 bg-white flex items-center justify-center text-xs text-gray-400">
                no preview
              </div>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-300/70 flex-wrap">
          <p className="text-sm text-gray-600">
            {warnCount > 0 &&
              `${warnCount} field${warnCount === 1 ? '' : 's'} need${warnCount === 1 ? 's' : ''} your judgment.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReset}
              className="px-5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onReset}
              className="px-5 py-2 rounded-md bg-blue-900 hover:bg-blue-950 text-white font-medium transition-colors"
            >
              Approve as-is
            </button>
          </div>
        </div>
      </div>

      <LabelModal
        open={modalOpen}
        imageUrl={imageUrl}
        alt="Submitted label image (enlarged)"
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

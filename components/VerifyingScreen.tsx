'use client';

import { useEffect, useState } from 'react';
import { deriveStages, progressRatio, type StageStatus } from '@/lib/ui/verifying';

interface VerifyingScreenProps {
  filename: string;
  imageUrl: string | null;
  startedAt: number;
  /** True once the fetch resolves; flips the final stage to done. */
  finished: boolean;
  onCancel: () => void;
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done') {
    return (
      <span
        aria-hidden="true"
        className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0"
      >
        ✓
      </span>
    );
  }
  if (status === 'current') {
    return (
      <span
        aria-hidden="true"
        className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center shrink-0"
      >
        <span className="w-2 h-2 rounded-full bg-white" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="w-6 h-6 rounded-full bg-gray-200 shrink-0"
    />
  );
}

export default function VerifyingScreen({
  filename,
  imageUrl,
  startedAt,
  finished,
  onCancel,
}: VerifyingScreenProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 100);
    return () => clearInterval(id);
  }, [startedAt, finished]);

  const stages = deriveStages(elapsedMs, finished);
  const ratio = progressRatio(stages);
  const elapsedText = `${(elapsedMs / 1000).toFixed(1)}s`;

  return (
    <div className="min-h-screen bg-slate-200/60 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left — label preview */}
        <div className="flex flex-col items-center justify-center">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Label preview"
              className="max-h-96 max-w-full object-contain rounded shadow-sm"
            />
          ) : (
            <div className="w-full max-w-sm h-12 rounded-full bg-slate-300/70 flex items-center justify-center">
              <span className="text-xs text-gray-500 font-mono tracking-widest">
                label preview
              </span>
            </div>
          )}
        </div>

        {/* Right — status */}
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs tracking-widest text-gray-500 uppercase">Verifying</p>
            <h1 className="text-3xl md:text-4xl font-serif font-medium text-gray-900 mt-2 break-all">
              {filename}
            </h1>
          </div>

          <ul className="space-y-3">
            {stages.map((stage) => (
              <li
                key={stage.id}
                className={`flex items-center gap-3 ${
                  stage.status === 'pending' ? 'text-gray-400' : 'text-gray-800'
                }`}
              >
                <StageIcon status={stage.status} />
                <span className="text-base">{stage.label}</span>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-300 pt-4">
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>Elapsed</span>
              <span className="font-mono">{elapsedText}</span>
            </div>
            <div
              className="mt-2 h-1.5 w-full rounded bg-slate-300/70 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <div
                className="h-full bg-blue-900 transition-[width] duration-200 ease-out"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

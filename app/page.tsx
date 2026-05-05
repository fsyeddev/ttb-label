import LabelVerifierLoader from '@/components/LabelVerifierLoader';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-blue-900" aria-hidden="true" />
            <span className="text-base font-medium text-gray-900">COLA Label Verification</span>
          </div>
          <div
            className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm font-medium"
            role="tablist"
            aria-label="Verification mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected="true"
              className="px-4 py-1.5 bg-blue-900 text-white"
            >
              Single label
            </button>
            <button
              type="button"
              role="tab"
              aria-selected="false"
              aria-disabled="true"
              tabIndex={-1}
              disabled
              title="Batch upload — coming soon"
              className="px-4 py-1.5 bg-white text-gray-400 cursor-not-allowed"
            >
              Batch upload
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <LabelVerifierLoader />
      </main>
    </div>
  );
}

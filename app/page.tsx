import LabelVerifierLoader from '@/components/LabelVerifierLoader';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-700 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-lg font-bold">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">TTB COLA Label Verifier</h1>
            <p className="text-sm text-gray-500">Alcohol &amp; Tobacco Tax and Trade Bureau · Label Review Tool</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <LabelVerifierLoader />
      </main>

      <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-12">
        TTB COLA Label Verifier · Prototype · For official use, consult TTB regulations at ttb.gov
      </footer>
    </div>
  );
}

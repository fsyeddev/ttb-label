'use client';

import { useEffect, useRef, useState } from 'react';
import UploadZone from '@/components/UploadZone';
import ApplicationForm from '@/components/ApplicationForm';
import ResultsCard from '@/components/ResultsCard';
import VerifyingScreen from '@/components/VerifyingScreen';
import { serializeAbv, type AbvUnit } from '@/lib/ui/form-helpers';
import type { ApplicationData, AnalysisResponse } from '@/types/cola';

const EMPTY_FORM: ApplicationData = {
  brand_name: '',
  class_type: '',
  abv: '',
  net_contents: '',
  bottler_name: '',
  bottler_address: '',
  country_of_origin: '',
  is_import: false,
};

type AppState = 'form' | 'loading' | 'results' | 'error';

export default function LabelVerifier() {
  const [appState, setAppState] = useState<AppState>('form');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState<ApplicationData>(EMPTY_FORM);
  const [abvValue, setAbvValue] = useState<string>('');
  const [abvUnit, setAbvUnit] = useState<AbvUnit>('percent');
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyStartedAt, setVerifyStartedAt] = useState<number>(0);
  const [verifyFinished, setVerifyFinished] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Keep an object URL for the uploaded image alive while a file is selected.
  // Used by the verifying screen and the results-page modal/thumbnail.
  useEffect(() => {
    if (!imageFile) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const canSubmit =
    imageFile !== null &&
    Boolean(formData.brand_name.trim()) &&
    Boolean(formData.class_type.trim()) &&
    Boolean(abvValue.trim()) &&
    Boolean(formData.net_contents.trim()) &&
    Boolean(formData.bottler_name.trim()) &&
    Boolean(formData.bottler_address.trim()) &&
    (!formData.is_import || Boolean(formData.country_of_origin.trim()));

  const handleSubmit = async () => {
    if (!imageFile || !canSubmit) return;
    setVerifyStartedAt(Date.now());
    setVerifyFinished(false);
    setAppState('loading');
    setErrorMessage(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = new FormData();
      body.append('labelImage', imageFile);
      body.append(
        'applicationData',
        JSON.stringify({ ...formData, abv: serializeAbv(abvValue, abvUnit) })
      );
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body,
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Server error. Please try again.');
      setResult(json as AnalysisResponse);
      setVerifyFinished(true);
      // Brief beat so the final stage check appears before the results page swap.
      setTimeout(() => setAppState('results'), 350);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setAppState('error');
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancelVerify = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAppState('form');
  };

  const handleClear = () => {
    setImageFile(null);
    setFormData(EMPTY_FORM);
    setAbvValue('');
    setAbvUnit('percent');
    setErrorMessage(null);
  };

  const handleReset = () => {
    handleClear();
    setResult(null);
    setAppState('form');
  };

  if (appState === 'loading') {
    return (
      <VerifyingScreen
        filename={imageFile?.name ?? 'label.png'}
        imageUrl={imageUrl}
        startedAt={verifyStartedAt}
        finished={verifyFinished}
        onCancel={handleCancelVerify}
      />
    );
  }

  if (appState === 'results' && result) {
    return <ResultsCard result={result} imageUrl={imageUrl} onReset={handleReset} />;
  }

  if (appState === 'error') {
    return (
      <div className="max-w-2xl mx-auto bg-red-50 border border-red-300 rounded-2xl p-8 text-center space-y-4 mt-12">
        <div className="text-5xl">⚠️</div>
        <h2 className="text-xl font-bold text-red-800">Something went wrong</h2>
        <p className="text-red-700">{errorMessage}</p>
        <button
          onClick={handleReset}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <div className="max-w-7xl mx-auto bg-slate-200/60 border border-slate-300/70 rounded-xl p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div>
            <UploadZone onImageSelected={setImageFile} currentFile={imageFile} />
          </div>
          <div>
            <ApplicationForm
              data={formData}
              onChange={setFormData}
              abvValue={abvValue}
              onAbvValueChange={setAbvValue}
              abvUnit={abvUnit}
              onAbvUnitChange={setAbvUnit}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleClear}
            type="button"
            className="px-5 py-2.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            type="button"
            className={
              canSubmit
                ? 'px-6 py-2.5 rounded-md bg-blue-900 hover:bg-blue-950 text-white font-medium transition-colors cursor-pointer'
                : 'px-6 py-2.5 rounded-md bg-blue-900/40 text-white font-medium cursor-not-allowed'
            }
          >
            Verify label →
          </button>
        </div>
      </div>
    </div>
  );
}

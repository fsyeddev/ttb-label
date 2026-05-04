'use client';

import { useState } from 'react';
import UploadZone from '@/components/UploadZone';
import ApplicationForm from '@/components/ApplicationForm';
import ResultsCard from '@/components/ResultsCard';
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
  const [formData, setFormData] = useState<ApplicationData>(EMPTY_FORM);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    imageFile !== null &&
    Boolean(formData.brand_name.trim()) &&
    Boolean(formData.class_type.trim()) &&
    Boolean(formData.abv.trim()) &&
    Boolean(formData.net_contents.trim()) &&
    Boolean(formData.bottler_name.trim()) &&
    Boolean(formData.bottler_address.trim());

  const handleSubmit = async () => {
    if (!imageFile || !canSubmit) return;
    setAppState('loading');
    setErrorMessage(null);
    try {
      const body = new FormData();
      body.append('labelImage', imageFile);
      body.append('applicationData', JSON.stringify(formData));
      const res = await fetch('/api/analyze', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Server error. Please try again.');
      setResult(json as AnalysisResponse);
      setAppState('results');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setAppState('error');
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setFormData(EMPTY_FORM);
    setResult(null);
    setErrorMessage(null);
    setAppState('form');
  };

  if (appState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 space-y-5 py-24">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-xl font-semibold text-gray-800">Analyzing Label…</p>
          <p className="text-gray-500 mt-1">Reading label with AI vision, then checking against COLA requirements.</p>
        </div>
      </div>
    );
  }

  if (appState === 'results' && result) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Verification Results</h2>
          <p className="text-gray-500 mt-1">Review the findings below for each required COLA field.</p>
        </div>
        <ResultsCard result={result} onReset={handleReset} />
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div className="bg-red-50 border border-red-300 rounded-2xl p-8 text-center space-y-4">
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
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Review a Label Application</h2>
        <p className="text-gray-500 mt-1">
          Upload the label image and enter the application data below. The system will check that
          they match and meet COLA requirements.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
            <span className="text-lg font-semibold text-gray-700">Upload Label Image</span>
          </div>
          <UploadZone onImageSelected={setImageFile} currentFile={imageFile} />
        </div>

        <div className="border-t border-gray-100" />

        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
            <span className="text-lg font-semibold text-gray-700">Enter Application Data</span>
          </div>
          <ApplicationForm data={formData} onChange={setFormData} />
        </div>

        <div className="border-t border-gray-100" />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-gray-500">
            {!imageFile && 'Upload a label image to continue.'}
            {imageFile && !canSubmit && 'Fill in all required fields to continue.'}
            {canSubmit && 'Ready to analyze.'}
          </p>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={
              canSubmit
                ? 'px-8 py-3 rounded-xl text-white font-bold text-lg bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md cursor-pointer transition-all'
                : 'px-8 py-3 rounded-xl text-white font-bold text-lg bg-gray-300 cursor-not-allowed transition-all'
            }
          >
            Analyze Label
          </button>
        </div>
      </div>
    </div>
  );
}

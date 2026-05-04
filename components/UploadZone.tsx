'use client';

import { useCallback, useState } from 'react';

interface UploadZoneProps {
  onImageSelected: (file: File) => void;
  currentFile: File | null;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

export default function UploadZone({ onImageSelected, currentFile }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Unsupported file type. Please upload a JPEG, PNG, or WEBP image.');
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
        return;
      }
      const url = URL.createObjectURL(file);
      setPreview(url);
      onImageSelected(file);
    },
    [onImageSelected]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full">
      <label className="block text-lg font-semibold text-gray-700 mb-2">
        Label Image <span className="text-red-500">*</span>
      </label>

      {preview && currentFile ? (
        <div className="relative rounded-xl border-2 border-green-400 bg-green-50 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Uploaded label preview"
            className="w-full max-h-72 object-contain p-2"
          />
          <div className="px-4 pb-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 truncate">{currentFile.name}</span>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              className="text-sm text-red-600 hover:text-red-700 font-medium ml-3 shrink-0"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer min-h-48 px-6 py-10
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 bg-white'}`}
          onClick={() => document.getElementById('label-file-input')?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload label image"
          onKeyDown={(e) => e.key === 'Enter' && document.getElementById('label-file-input')?.click()}
        >
          <input
            id="label-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onInputChange}
          />
          <div className="text-4xl mb-3" aria-hidden="true">📄</div>
          <p className="text-lg font-semibold text-gray-700 text-center">
            {isDragging ? 'Drop the label image here' : 'Drag & drop the label image here'}
          </p>
          <p className="text-sm text-gray-500 mt-1">or click to browse files</p>
          <p className="text-xs text-gray-400 mt-2">JPEG, PNG, or WEBP · Max 10 MB</p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

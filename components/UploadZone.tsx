'use client';

import { useCallback, useEffect, useState } from 'react';

interface UploadZoneProps {
  onImageSelected: (file: File | null) => void;
  currentFile: File | null;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;
const WARN_SIZE_MB = 4;

export default function UploadZone({ onImageSelected, currentFile }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // Sync preview with the parent's currentFile so Clear from outside this
  // component (Verify card footer) actually removes the preview.
  useEffect(() => {
    if (!currentFile) {
      setPreview(null);
      setSizeWarning(false);
      return;
    }
    const url = URL.createObjectURL(currentFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [currentFile]);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      setSizeWarning(false);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Unsupported file type. Please upload a JPEG, PNG, or WEBP image.');
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
        return;
      }
      if (file.size > WARN_SIZE_MB * 1024 * 1024) {
        setSizeWarning(true);
      }
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

  const openPicker = () => document.getElementById('label-file-input')?.click();

  return (
    <div className="w-full h-full">
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={openPicker}
        role="button"
        tabIndex={0}
        aria-label="Upload label image"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer w-full h-full min-h-[420px] px-6 py-10
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50/60'
              : preview
              ? 'border-gray-300 bg-white'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
          }`}
      >
        <input
          id="label-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onInputChange}
        />

        {preview && currentFile ? (
          <div className="flex flex-col items-center gap-3 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Uploaded label preview"
              className="max-h-80 max-w-full object-contain rounded"
            />
            <p className="text-xs text-gray-500 truncate max-w-full px-4">{currentFile.name}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onImageSelected(null);
              }}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-blue-700/90 text-white flex items-center justify-center mb-4 text-xl">
              ↑
            </div>
            <p className="text-base font-medium text-gray-700 text-center">
              {isDragging ? 'Drop the label image here' : 'Drop label image here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">or click to browse</p>
            <p className="text-xs text-gray-400 mt-6">PNG · JPG · PDF · up to 20 MB</p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
      {!error && sizeWarning && (
        <p className="mt-2 text-sm text-amber-700 font-medium" role="alert">
          Image is too large to upload ({WARN_SIZE_MB} MB limit). Please use a smaller image.
        </p>
      )}
    </div>
  );
}

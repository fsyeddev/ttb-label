'use client';

import { useEffect } from 'react';

interface LabelModalProps {
  open: boolean;
  imageUrl: string | null;
  alt: string;
  onClose: () => void;
}

export default function LabelModal({ open, imageUrl, alt, onClose }: LabelModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submitted label image"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-800 text-xl font-bold flex items-center justify-center shadow"
      >
        ×
      </button>
      {/* Stop click-through so clicking the image itself doesn't close the modal. */}
      <div onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
        />
      </div>
    </div>
  );
}

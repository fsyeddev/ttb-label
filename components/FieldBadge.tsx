'use client';

import type { FieldStatus } from '@/types/cola';

interface FieldBadgeProps {
  status: FieldStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<FieldStatus, { label: string; icon: string; classes: string }> = {
  pass: {
    label: 'PASS',
    icon: '✓',
    classes: 'bg-green-100 text-green-800 border border-green-300',
  },
  fail: {
    label: 'FAIL',
    icon: '✗',
    classes: 'bg-red-100 text-red-800 border border-red-300',
  },
  warning: {
    label: 'REVIEW',
    icon: '!',
    classes: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  },
  missing: {
    label: 'MISSING',
    icon: '?',
    classes: 'bg-gray-100 text-gray-700 border border-gray-300',
  },
};

export default function FieldBadge({ status, size = 'md' }: FieldBadgeProps) {
  const { label, icon, classes } = CONFIG[status];
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizeClasses} ${classes}`}
      role="status"
      aria-label={label}
    >
      <span aria-hidden="true" className="font-bold">{icon}</span>
      {label}
    </span>
  );
}

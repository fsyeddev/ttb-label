'use client';

import { useCallback, useRef, useState } from 'react';
import type { ApplicationData } from '@/types/cola';
import { parseJSONImport } from '@/lib/parsers/json-import';
import { parseCSVImport } from '@/lib/parsers/csv-import';

interface ApplicationFormProps {
  data: ApplicationData;
  onChange: (data: ApplicationData) => void;
}

const FIELDS: {
  key: keyof ApplicationData;
  label: string;
  placeholder: string;
  required: boolean;
  hint: string;
}[] = [
  {
    key: 'brand_name',
    label: 'Brand Name',
    placeholder: 'e.g. JIM BEAM',
    required: true,
    hint: 'The product name as it appears on the label — not the spirit type. Examples: "JIM BEAM", "JACK DANIEL\'S OLD NO. 7", "GREY GOOSE", "PATRON SILVER"',
  },
  {
    key: 'class_type',
    label: 'Class / Type',
    placeholder: 'e.g. Kentucky Straight Bourbon Whiskey',
    required: true,
    hint: 'The spirit category printed on the label — this is separate from the brand name. Examples: "Bourbon Whiskey", "Vodka", "Tennessee Whiskey", "Blended Scotch Whisky", "Gin"',
  },
  {
    key: 'abv',
    label: 'Alcohol Content (ABV)',
    placeholder: 'e.g. 40% Alc./Vol.',
    required: true,
    hint: 'Copy exactly as it appears on the label. Also accepted: "80 Proof"',
  },
  {
    key: 'net_contents',
    label: 'Bottle Size',
    placeholder: 'e.g. 750 mL',
    required: true,
    hint: 'The volume printed on the bottle. Examples: "750 mL", "1 L", "375 mL", "1.75 L"',
  },
  {
    key: 'bottler_name',
    label: 'Bottler / Producer Name',
    placeholder: 'e.g. Brown-Forman Distillers Corporation',
    required: true,
    hint: 'The company name printed on the label — often different from the brand name',
  },
  {
    key: 'bottler_address',
    label: 'Bottler / Producer Address',
    placeholder: 'e.g. Louisville, KY 40210',
    required: true,
    hint: 'City and state (or full address) as printed on the label',
  },
  {
    key: 'country_of_origin',
    label: 'Country of Origin',
    placeholder: 'e.g. Scotland, France, Mexico',
    required: false,
    hint: 'Only required for imported products. Leave blank for domestic (USA) products.',
  },
];

const INPUT_BASE =
  'w-full rounded-lg border px-4 py-3 text-base text-black placeholder:text-[#767676] focus:outline-none focus:ring-2 focus:ring-blue-500 transition';

export default function ApplicationForm({ data, onChange }: ApplicationFormProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const handleField = (key: keyof ApplicationData, value: string) => {
    setTouched((prev) => new Set(prev).add(key));
    onChange({ ...data, [key]: value });
  };

  const handleImportFile = useCallback(
    async (file: File) => {
      setImportError(null);
      setImportWarnings([]);
      setImportSuccess(false);
      const text = await file.text();
      const result = file.name.endsWith('.csv') ? parseCSVImport(text) : parseJSONImport(text);
      if (result.errors.length > 0) {
        setImportError(result.errors.join(' · '));
        return;
      }
      if (result.data) {
        onChange(result.data);
        setImportWarnings(result.warnings);
        setImportSuccess(true);
      }
    },
    [onChange]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  };

  const isRequired = (key: keyof ApplicationData) =>
    FIELDS.find((f) => f.key === key)?.required ?? false;

  const hasError = (key: keyof ApplicationData) =>
    touched.has(key) && isRequired(key) && !data[key as keyof typeof data];

  return (
    <div className="space-y-4">
      {/* Header + import button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Application Data</h2>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 font-medium transition-colors"
        >
          Import from JSON / CSV
        </button>
        <input ref={fileRef} type="file" accept=".json,.csv" className="sr-only" onChange={onFileInput} />
      </div>

      {importSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-300 px-4 py-3 text-sm text-green-700">
          ✓ File imported successfully. Review the fields below and make any corrections.
          {importWarnings.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-yellow-700">
              {importWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {importError && (
        <div className="rounded-lg bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-700">
          {importError}
        </div>
      )}

      {/* Form fields */}
      <div className="grid grid-cols-1 gap-5">
        {FIELDS.map(({ key, label, placeholder, required, hint }) => (
          <div key={key}>
            <label htmlFor={`field-${key}`} className="block text-base font-medium text-gray-800 mb-1">
              {label} {required && <span className="text-red-500">*</span>}
            </label>
            <p className="text-xs text-gray-500 mb-1.5">{hint}</p>
            <input
              id={`field-${key}`}
              type="text"
              value={String(data[key as keyof typeof data] ?? '')}
              onChange={(e) => handleField(key, e.target.value)}
              placeholder={placeholder}
              className={`${INPUT_BASE} ${
                hasError(key) ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              aria-required={required}
            />
            {hasError(key) && (
              <p className="mt-1 text-sm text-red-600" role="alert">
                This field is required.
              </p>
            )}
          </div>
        ))}

        {/* Government warning — informational only, auto-checked on submit */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex gap-3 items-start">
          <span className="text-blue-500 text-lg mt-0.5" aria-hidden="true">ℹ</span>
          <div>
            <p className="text-sm font-medium text-blue-800">Government Warning — Automatically Checked</p>
            <p className="text-xs text-blue-600 mt-0.5">
              The system will read the government warning directly from the label and verify it matches
              the official TTB-required text, including correct ALL CAPS formatting.
              You do not need to enter it here.
            </p>
          </div>
        </div>

        {/* Import checkbox */}
        <div className="flex items-center gap-3">
          <input
            id="is-import"
            type="checkbox"
            checked={data.is_import ?? false}
            onChange={(e) => onChange({ ...data, is_import: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="is-import" className="text-base text-gray-700">
            This is an imported product (country of origin required)
          </label>
        </div>

        {/* Optional age in years — drives the whisky aging advisory (27 CFR 5.40).
            Only relevant for whisky aged under 4 years; left blank otherwise. */}
        <div>
          <label htmlFor="aged-years" className="block text-base font-medium text-gray-800 mb-1">
            Aged Years <span className="text-gray-400 font-normal">(optional, whisky only)</span>
          </label>
          <p className="text-xs text-gray-500 mb-1.5">
            For whisky aged under 4 years, enter the age here. The system will check the label for
            an age statement (27 CFR 5.40). Leave blank otherwise.
          </p>
          <input
            id="aged-years"
            type="number"
            min={0}
            step={1}
            value={data.aged_years ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...data,
                aged_years: v === '' ? undefined : Number(v),
              });
            }}
            placeholder="e.g. 2"
            className={`${INPUT_BASE} border-gray-300 bg-white hover:border-gray-400 max-w-50`}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import type { ApplicationData } from '@/types/cola';
import { parseJSONImport } from '@/lib/parsers/json-import';
import { parseCSVImport } from '@/lib/parsers/csv-import';
import {
  sanitizeNumericInput,
  parseAbvString,
  extractNumericPart,
  type AbvUnit,
} from '@/lib/ui/form-helpers';

export type { AbvUnit };

interface ApplicationFormProps {
  data: ApplicationData;
  onChange: (data: ApplicationData) => void;
  abvValue: string;
  onAbvValueChange: (raw: string) => void;
  abvUnit: AbvUnit;
  onAbvUnitChange: (unit: AbvUnit) => void;
}

const INPUT_BASE =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

const LABEL_BASE = 'block text-[11px] font-medium tracking-wider text-gray-500 uppercase mb-1';

export default function ApplicationForm({
  data,
  onChange,
  abvValue,
  onAbvValueChange,
  abvUnit,
  onAbvUnitChange,
}: ApplicationFormProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleField = (key: keyof ApplicationData, value: string) => {
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
        // ABV and Net Contents are stored as digits-only in the form's input
        // state. Imported strings carry units ("45% Alc./Vol.", "750 mL"); we
        // strip them here so the inputs render correctly. data.abv itself is
        // overwritten at submit time by serializeAbv(abvValue, abvUnit).
        const { value: abvVal, unit: abvUnitParsed } = parseAbvString(result.data.abv);
        onAbvValueChange(abvVal);
        onAbvUnitChange(abvUnitParsed);
        const cleanedNetContents = extractNumericPart(result.data.net_contents);
        onChange({ ...result.data, abv: '', net_contents: cleanedNetContents });
        setImportWarnings(result.warnings);
        setImportSuccess(true);
      }
    },
    [onChange, onAbvValueChange, onAbvUnitChange]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  };

  const toggleImport = (checked: boolean) => {
    if (checked) {
      onChange({ ...data, is_import: true });
    } else {
      onChange({ ...data, is_import: false, country_of_origin: '' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wider text-gray-500 uppercase">
          Application Data
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline transition-colors"
        >
          Import JSON / CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv"
          className="sr-only"
          onChange={onFileInput}
        />
      </div>

      {importSuccess && (
        <div className="rounded-md bg-green-50 border border-green-300 px-3 py-2 text-sm text-green-700">
          ✓ File imported successfully.
          {importWarnings.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-yellow-700">
              {importWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {importError && (
        <div className="rounded-md bg-red-50 border border-red-300 px-3 py-2 text-sm text-red-700">
          {importError}
        </div>
      )}

      <div>
        <label htmlFor="field-brand" className={LABEL_BASE}>
          Brand Name
        </label>
        <input
          id="field-brand"
          type="text"
          value={data.brand_name}
          onChange={(e) => handleField('brand_name', e.target.value)}
          className={INPUT_BASE}
        />
      </div>

      <div>
        <label htmlFor="field-class" className={LABEL_BASE}>
          Class / Type
        </label>
        <input
          id="field-class"
          type="text"
          value={data.class_type}
          onChange={(e) => handleField('class_type', e.target.value)}
          className={INPUT_BASE}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="field-abv" className={LABEL_BASE}>
            ABV
          </label>
          <div className="relative">
            <input
              id="field-abv"
              type="text"
              inputMode="decimal"
              value={abvValue}
              onChange={(e) => onAbvValueChange(sanitizeNumericInput(e.target.value))}
              // Right-align so the typed digits visually butt against the suffix.
              className={`${INPUT_BASE} text-right pr-24`}
            />
            <button
              type="button"
              onClick={() => onAbvUnitChange(abvUnit === 'percent' ? 'proof' : 'percent')}
              // Suffix lives inside the input visual; click toggles % ↔ Proof.
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-500 hover:text-blue-700 cursor-pointer select-none"
              aria-label={`Switch ABV unit, currently ${abvUnit === 'percent' ? '% Alc./Vol.' : 'Proof'}`}
              tabIndex={-1}
            >
              {abvUnit === 'percent' ? '% Alc./Vol.' : 'Proof'}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="field-net" className={LABEL_BASE}>
            Net Contents
          </label>
          <div className="relative">
            <input
              id="field-net"
              type="text"
              inputMode="decimal"
              value={data.net_contents}
              onChange={(e) => handleField('net_contents', sanitizeNumericInput(e.target.value))}
              className={`${INPUT_BASE} text-right pr-12`}
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-500 select-none">
              mL
            </span>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="field-bottler" className={LABEL_BASE}>
          Bottler Name
        </label>
        <input
          id="field-bottler"
          type="text"
          value={data.bottler_name}
          onChange={(e) => handleField('bottler_name', e.target.value)}
          className={INPUT_BASE}
        />
      </div>

      <div>
        <label htmlFor="field-bottler-address" className={LABEL_BASE}>
          Bottler Address
        </label>
        <input
          id="field-bottler-address"
          type="text"
          value={data.bottler_address}
          onChange={(e) => handleField('bottler_address', e.target.value)}
          className={INPUT_BASE}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is-import"
          type="checkbox"
          checked={data.is_import ?? false}
          onChange={(e) => toggleImport(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="is-import" className="text-sm text-gray-700 select-none">
          Imported product
        </label>
      </div>

      {data.is_import && (
        <div>
          <label htmlFor="field-country" className={LABEL_BASE}>
            Country of Origin
          </label>
          <input
            id="field-country"
            type="text"
            value={data.country_of_origin}
            onChange={(e) => handleField('country_of_origin', e.target.value)}
            className={INPUT_BASE}
          />
        </div>
      )}
    </div>
  );
}

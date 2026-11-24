import React, { useEffect, useState } from 'react';
import { ArrowRight, Plus, Upload } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Patient } from '../lib/types';

export const PatientManagementView: React.FC = () => {
  const [patients, setPatients] = useState<Array<Patient & { encounter_count?: number; primary_payer?: string }>>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const [mrn, setMrn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('1975-01-15');
  const [sex, setSex] = useState<'M' | 'F' | 'U'>('F');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');

  async function loadPatients(q = '') {
    setLoading(true);
    try {
      const res = await apiRequest<{ patients: typeof patients }>(`/patients?q=${encodeURIComponent(q)}`);
      setPatients(res.patients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPatients(query);
  }, [query]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/patients', {
        method: 'POST',
        body: JSON.stringify({
          mrn,
          first_name: firstName,
          last_name: lastName,
          dob,
          sex,
          city,
          state: stateCode,
          is_synthetic: true,
        }),
      });
      setShowCreate(false);
      setMrn('');
      setFirstName('');
      setLastName('');
      await loadPatients(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          aria-label="Filter patients by name or MRN"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by patient name or MRN..."
          className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Synthetic Patient
        </button>
      </div>

      {error && <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">MRN</th>
              <th className="py-2.5 px-4 font-semibold">Patient Name</th>
              <th className="py-2.5 px-4 font-semibold">DOB</th>
              <th className="py-2.5 px-4 font-semibold">Sex</th>
              <th className="py-2.5 px-4 font-semibold">Location</th>
              <th className="py-2.5 px-4 font-semibold">Primary Payer</th>
              <th className="py-2.5 px-4 font-semibold text-right">Encounters</th>
              <th className="py-2.5 px-4 font-semibold">Classification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  Loading patient registry...
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  No patients found.
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-semibold text-[#071D49]">{p.mrn}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700">{p.dob}</td>
                  <td className="py-3 px-4 text-slate-700">{p.sex}</td>
                  <td className="py-3 px-4 text-slate-600">
                    {p.city && p.state ? `${p.city}, ${p.state}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{p.primary_payer ?? 'None recorded'}</td>
                  <td className="py-3 px-4 text-right font-mono">{p.encounter_count ?? 0}</td>
                  <td className="py-3 px-4 text-[#D97706] font-medium">
                    {p.is_synthetic ? 'Synthetic Test' : 'Production'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-3.5 text-xs">
            <h2 className="font-display text-base font-bold text-[#071D49]">Register Synthetic Patient</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pat-mrn" className="block font-medium text-slate-700 mb-1">
                  MRN
                </label>
                <input
                  id="pat-mrn"
                  type="text"
                  required
                  value={mrn}
                  onChange={(e) => setMrn(e.target.value)}
                  placeholder="SYN-MRN-5001"
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="pat-dob" className="block font-medium text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  id="pat-dob"
                  type="date"
                  required
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pat-fn" className="block font-medium text-slate-700 mb-1">
                  First Name
                </label>
                <input
                  id="pat-fn"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="pat-ln" className="block font-medium text-slate-700 mb-1">
                  Last Name
                </label>
                <input
                  id="pat-ln"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="pat-sex" className="block font-medium text-slate-700 mb-1">
                  Sex
                </label>
                <select
                  id="pat-sex"
                  value={sex}
                  onChange={(e) => setSex(e.target.value as 'M' | 'F' | 'U')}
                  className="w-full px-2 py-2 border border-slate-300 rounded-md"
                >
                  <option value="F">F</option>
                  <option value="M">M</option>
                  <option value="U">U</option>
                </select>
              </div>
              <div>
                <label htmlFor="pat-city" className="block font-medium text-slate-700 mb-1">
                  City
                </label>
                <input
                  id="pat-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="pat-state" className="block font-medium text-slate-700 mb-1">
                  State
                </label>
                <input
                  id="pat-state"
                  type="text"
                  maxLength={2}
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="MA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-300 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer"
              >
                Save Patient
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface MedicalRecordsViewProps {
  onOpenEncounter: (encounterId: string) => void;
}

export const MedicalRecordsView: React.FC<MedicalRecordsViewProps> = ({ onOpenEncounter }) => {
  const [records, setRecords] = useState<
    Array<{
      id: string;
      encounter_id: string;
      patient_name: string;
      patient_mrn: string;
      encounter_number: string;
      date_of_service: string;
      document_type: string;
      file_name: string;
      page_count: number;
      ocr_status: string;
      prompt_injection_flagged: number;
      coding_status: string;
    }>
  >([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [dos, setDos] = useState('2026-11-20');
  const [encType, setEncType] = useState<'Outpatient' | 'Inpatient' | 'Emergency' | 'Operative' | 'Telehealth'>('Outpatient');
  const [docType, setDocType] = useState('Clinical Encounter Note');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function loadData() {
    try {
      const [recRes, patRes] = await Promise.all([
        apiRequest<{ records: typeof records }>('/medical-records'),
        apiRequest<{ patients: Patient[] }>('/patients'),
      ]);
      setRecords(recRes.records);
      setPatients(patRes.patients);
      if (!patientId && patRes.patients[0]) {
        setPatientId(patRes.patients[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load medical records');
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('patient_id', patientId);
      formData.append('date_of_service', dos);
      formData.append('encounter_type', encType);
      formData.append('document_type', docType);
      formData.append('chief_complaint', chiefComplaint || `${docType} upload`);
      if (rawText.trim()) formData.append('raw_text_input', rawText.trim());
      if (selectedFile) formData.append('file', selectedFile);

      const res = await apiRequest<{
        encounter_id: string;
        promptInjectionDetected: boolean;
      }>('/medical-records/upload', {
        method: 'POST',
        body: formData,
      });

      setSuccessMsg(
        `Document ingested into encounter queue${res.promptInjectionDetected ? ' (prompt-injection directives neutralized)' : ''}.`,
      );
      setRawText('');
      setChiefComplaint('');
      setSelectedFile(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="font-display text-sm font-bold text-[#071D49] mb-1">
          Upload &amp; Process Clinical Documentation
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Accepts PDFs, scanned medical images (PNG/JPG), EHR text notes, and HL7/FHIR JSON. Use synthetic/de-identified data in sandbox mode.
        </p>

        {error && <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
        {successMsg && (
          <div className="mb-3 p-3 rounded bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 text-xs">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="rec-pat" className="block font-medium text-slate-700 mb-1">
                Patient
              </label>
              <select
                id="rec-pat"
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rec-dos" className="block font-medium text-slate-700 mb-1">
                Date of Service
              </label>
              <input
                id="rec-dos"
                type="date"
                required
                value={dos}
                onChange={(e) => setDos(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="rec-enctype" className="block font-medium text-slate-700 mb-1">
                Encounter Type
              </label>
              <select
                id="rec-enctype"
                value={encType}
                onChange={(e) => setEncType(e.target.value as typeof encType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                <option value="Outpatient">Outpatient</option>
                <option value="Inpatient">Inpatient</option>
                <option value="Emergency">Emergency</option>
                <option value="Operative">Operative</option>
                <option value="Telehealth">Telehealth</option>
              </select>
            </div>
            <div>
              <label htmlFor="rec-doctype" className="block font-medium text-slate-700 mb-1">
                Document Classification
              </label>
              <select
                id="rec-doctype"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                <option>Clinical Encounter Note</option>
                <option>Operative Report</option>
                <option>Radiology Report</option>
                <option>Laboratory Report</option>
                <option>Physician Documentation</option>
                <option>Insurance Face Sheet</option>
                <option>EHR / FHIR Export</option>
              </select>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rec-cc" className="block font-medium text-slate-700 mb-1">
                Chief Complaint / Encounter Summary
              </label>
              <input
                id="rec-cc"
                type="text"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="e.g. Right knee osteoarthritis follow-up and injection"
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="rec-file" className="block font-medium text-slate-700 mb-1">
                Attach PDF, Scanned Image, or Text/HL7/FHIR File (Optional if pasting note)
              </label>
              <input
                id="rec-file"
                type="file"
                accept=".pdf,.txt,.json,.hl7,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-[#F8FAFC]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rec-text" className="block font-medium text-slate-700 mb-1">
              Clinical Note Text (Optional if uploading PDF/Image)
            </label>
            <textarea
              id="rec-text"
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste synthetic clinical encounter note, operative report, or diagnostic findings..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#071D49] hover:bg-[#0D2B66] rounded-md cursor-pointer disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Processing Document...' : 'Ingest Clinical Record'}
          </button>
        </form>
      </div>

      {/* Records Repository Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-left">
              <th className="py-2.5 px-4 font-semibold">Document</th>
              <th className="py-2.5 px-4 font-semibold">Classification</th>
              <th className="py-2.5 px-4 font-semibold">Patient</th>
              <th className="py-2.5 px-4 font-semibold">DOS</th>
              <th className="py-2.5 px-4 font-semibold">OCR</th>
              <th className="py-2.5 px-4 font-semibold">Safety Check</th>
              <th className="py-2.5 px-4 font-semibold text-right">Workspace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="py-3 px-4 font-medium text-[#071D49]">{r.file_name}</td>
                <td className="py-3 px-4 text-slate-700">{r.document_type}</td>
                <td className="py-3 px-4">
                  <span className="font-medium text-slate-900">{r.patient_name}</span>{' '}
                  <span className="font-mono text-slate-500">({r.patient_mrn})</span>
                </td>
                <td className="py-3 px-4 font-mono text-slate-700">{r.date_of_service}</td>
                <td className="py-3 px-4">{r.ocr_status}</td>
                <td className="py-3 px-4">
                  {r.prompt_injection_flagged ? (
                    <span className="text-[#D97706] font-semibold">Injection Sanitized</span>
                  ) : (
                    <span className="text-[#16A34A]">Clean</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenEncounter(r.encounter_id)}
                    className="inline-flex items-center gap-1 text-[#2563EB] font-semibold hover:underline cursor-pointer"
                  >
                    Code Encounter
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowRight, Plus, Upload, UserPlus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Patient, Provider } from '../lib/types';

export const PatientManagementView: React.FC = () => {
  const [patients, setPatients] = useState<Array<Patient & { encounter_count?: number; primary_payer?: string }>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const [mrn, setMrn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<'M' | 'F' | 'U'>('F');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');

  async function loadPatients(q = query, targetPage = page) {
    setLoading(true);
    try {
      const res = await apiRequest<{ patients: typeof patients; total: number }>(
        `/patients?q=${encodeURIComponent(q)}&page=${targetPage}&pageSize=25`,
      );
      setPatients(res.patients);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPatients(query, page);
  }, [query, page]);

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
          is_synthetic: false,
        }),
      });
      setShowCreate(false);
      setMrn('');
      setFirstName('');
      setLastName('');
      setDob('');
      setCity('');
      setStateCode('');
      await loadPatients(query, 1);
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
          onChange={(e) => {
            setPage(1);
            setQuery(e.target.value);
          }}
          placeholder="Filter by patient name or MRN..."
          className="px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        />
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Patient
        </button>
      </div>

      {error && <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
              <th className="py-2.5 px-4 font-semibold">MRN</th>
              <th className="py-2.5 px-4 font-semibold">Patient Name</th>
              <th className="py-2.5 px-4 font-semibold">DOB</th>
              <th className="py-2.5 px-4 font-semibold">Sex</th>
              <th className="py-2.5 px-4 font-semibold">Location</th>
              <th className="py-2.5 px-4 font-semibold">Primary Payer</th>
              <th className="py-2.5 px-4 font-semibold text-right">Encounters</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[#64748B]">
                  Loading patient registry...
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center space-y-3">
                  <p className="text-[#64748B]">No patients registered in this organization yet.</p>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1830] rounded-md cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Register First Patient
                  </button>
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-semibold text-[#0B1830]">{p.mrn}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700">{p.dob}</td>
                  <td className="py-3 px-4 text-slate-700">{p.sex}</td>
                  <td className="py-3 px-4 text-[#64748B]">
                    {p.city && p.state ? `${p.city}, ${p.state}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{p.primary_payer ?? 'None recorded'}</td>
                  <td className="py-3 px-4 text-right font-mono">{p.encounter_count ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 25 && (
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Showing page {page} of {Math.ceil(total / 25)} ({total} patients)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-3.5 text-xs">
            <h2 className="font-display text-base font-bold text-[#0B1830]">Register Patient Record</h2>
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
                  placeholder="MRN-10042"
                  className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-2 py-2 border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
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
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 font-medium text-slate-700 bg-white border border-[#E2E8F0] rounded-md cursor-pointer"
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
      prompt_injection_flagged: number | boolean;
      coding_status: string;
    }>
  >([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patientId, setPatientId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [dos, setDos] = useState(new Date().toISOString().slice(0, 10));
  const [encType, setEncType] = useState<'Outpatient' | 'Inpatient' | 'Emergency' | 'Operative' | 'Telehealth'>('Outpatient');
  const [docType, setDocType] = useState('Clinical Encounter Note');
  const [specialty, setSpecialty] = useState('General Medicine');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Quick Add Provider modal
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [provNpi, setProvNpi] = useState('');
  const [provName, setProvName] = useState('');
  const [provSpec, setProvSpec] = useState('Internal Medicine');
  const [provCred, setProvCred] = useState('MD');

  async function loadData(targetPage = page) {
    try {
      const [recRes, patRes, provRes] = await Promise.all([
        apiRequest<{ records: typeof records; total: number }>(`/medical-records?page=${targetPage}&pageSize=25`),
        apiRequest<{ patients: Patient[] }>('/patients?pageSize=100'),
        apiRequest<{ providers: Provider[] }>('/providers'),
      ]);
      setRecords(recRes.records);
      setTotal(recRes.total);
      setPatients(patRes.patients);
      setProviders(provRes.providers);
      if (!patientId && patRes.patients[0]) {
        setPatientId(patRes.patients[0].id);
      }
      if (!providerId && provRes.providers[0]) {
        setProviderId(provRes.providers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load medical records');
    }
  }

  useEffect(() => {
    void loadData(page);
  }, [page]);

  async function handleAddProvider(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await apiRequest<{ provider: Provider }>('/providers', {
        method: 'POST',
        body: JSON.stringify({
          npi: provNpi,
          full_name: provName,
          specialty: provSpec,
          credential: provCred,
          network_status: 'UNVERIFIED',
        }),
      });
      setShowAddProvider(false);
      setProvNpi('');
      setProvName('');
      await loadData(page);
      setProviderId(res.provider.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) {
      setError('Select or register a patient before ingesting clinical documentation.');
      return;
    }
    setError('');
    setSuccessMsg('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('patient_id', patientId);
      if (providerId) formData.append('provider_id', providerId);
      formData.append('date_of_service', dos);
      formData.append('encounter_type', encType);
      formData.append('specialty', specialty);
      formData.append('document_type', docType);
      formData.append('chief_complaint', chiefComplaint || `${docType} upload`);
      if (rawText.trim()) formData.append('raw_text_input', rawText.trim());
      if (selectedFile) formData.append('file', selectedFile);

      const res = await apiRequest<{
        encounter_id: string;
        ocrStatus: string;
        promptInjectionDetected: boolean;
      }>('/medical-records/upload', {
        method: 'POST',
        body: formData,
      });

      setSuccessMsg(
        `Document stored in private bucket (OCR: ${res.ocrStatus})${res.promptInjectionDetected ? ' · Prompt-injection patterns neutralized' : ''}.`,
      );
      setRawText('');
      setChiefComplaint('');
      setSelectedFile(null);
      await loadData(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-display text-sm font-bold text-[#0B1830]">
              Upload &amp; Process Clinical Documentation
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Accepts validated PDFs, scanned images (PNG/JPG/WEBP), clinical text notes, and HL7/FHIR JSON. Stored in organization-isolated private storage.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddProvider(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1830] bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-md cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Rendering Provider
          </button>
        </div>

        {error && <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626]">{error}</div>}
        {successMsg && (
          <div className="mb-3 p-3 rounded bg-teal-50 border border-teal-200 text-xs text-[#0D9488] font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 text-xs">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="rec-pat" className="block font-medium text-slate-700 mb-1">
                Patient
              </label>
              <select
                id="rec-pat"
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white"
              >
                {patients.length === 0 ? (
                  <option value="">Register a patient first</option>
                ) : (
                  patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.mrn})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label htmlFor="rec-prov" className="block font-medium text-slate-700 mb-1">
                Rendering Provider
              </label>
              <select
                id="rec-prov"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white"
              >
                <option value="">Auto-assign / Default</option>
                {providers.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.full_name} ({pr.npi})
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
                className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md"
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
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white"
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
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white"
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

          <div className="grid lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rec-spec" className="block font-medium text-slate-700 mb-1">
                Clinical Specialty
              </label>
              <input
                id="rec-spec"
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
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
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md"
              />
            </div>
            <div>
              <label htmlFor="rec-file" className="block font-medium text-slate-700 mb-1">
                Attach PDF, Image, or Text/FHIR File (25MB max)
              </label>
              <input
                id="rec-file"
                type="file"
                accept=".pdf,.txt,.json,.hl7,.csv,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-1.5 border border-[#E2E8F0] rounded-md bg-[#F1F5F9]"
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
              placeholder="Paste encounter note, operative report, radiology narrative, or diagnostic findings..."
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={uploading || patients.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1830] hover:bg-[#13264A] rounded-md cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Validating & Uploading...' : 'Ingest Clinical Record'}
          </button>
        </form>
      </div>

      {/* Records Repository Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#64748B] text-left">
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
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#64748B]">
                  No clinical documents uploaded yet.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-medium text-[#0B1830]">{r.file_name}</td>
                  <td className="py-3 px-4 text-slate-700">{r.document_type}</td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-900">{r.patient_name}</span>{' '}
                    <span className="font-mono text-[#64748B]">({r.patient_mrn})</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700">{r.date_of_service}</td>
                  <td className="py-3 px-4">{r.ocr_status}</td>
                  <td className="py-3 px-4">
                    {Boolean(r.prompt_injection_flagged) ? (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 25 && (
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Page {page} of {Math.ceil(total / 25)} ({total} records)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 bg-white border border-[#E2E8F0] rounded disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAddProvider && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddProvider} className="bg-white border border-[#E2E8F0] rounded-lg max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-display text-base font-bold text-[#0B1830]">Register Rendering Provider</h3>
            <div>
              <label htmlFor="prov-npi" className="block font-medium text-slate-700 mb-1">Provider NPI (10 digits)</label>
              <input id="prov-npi" required pattern="\d{10}" value={provNpi} onChange={(e) => setProvNpi(e.target.value)} placeholder="1234567890" className="w-full px-3 py-2 font-mono border border-[#E2E8F0] rounded-md" />
            </div>
            <div>
              <label htmlFor="prov-name" className="block font-medium text-slate-700 mb-1">Full Name</label>
              <input id="prov-name" required value={provName} onChange={(e) => setProvName(e.target.value)} placeholder="Dr. Maya Lin" className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="prov-spec" className="block font-medium text-slate-700 mb-1">Specialty</label>
                <input id="prov-spec" required value={provSpec} onChange={(e) => setProvSpec(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
              </div>
              <div>
                <label htmlFor="prov-cred" className="block font-medium text-slate-700 mb-1">Credential</label>
                <input id="prov-cred" required value={provCred} onChange={(e) => setProvCred(e.target.value)} className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddProvider(false)} className="px-4 py-2 border border-[#E2E8F0] rounded-md cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#2563EB] rounded-md cursor-pointer">Save Provider</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

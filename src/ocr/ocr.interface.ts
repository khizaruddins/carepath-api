export interface OcrInput {
  documentId: string;
  storageKey: string;
  mimeType: string;
  fileName: string;
  buffer?: Buffer;
}

export interface ExtractedMedicalData {
  reportTitle?: string;
  providerName?: string;
  facility?: string;
  documentDate?: string;
  documentCategory?: string;
  patientName?: string;
  findingsSummary?: string;
  parameters?: Array<{
    name: string;
    value: string;
    unit?: string;
    referenceRange?: string;
  }>;
}

export interface OcrResult {
  success: boolean;
  confidence: number;
  rawText: string;
  extractedData: ExtractedMedicalData;
  processingTimeMs: number;
  errorMessage?: string;
}

export interface OcrProvider {
  name: string;
  processDocument(input: OcrInput): Promise<OcrResult>;
}

export const OCR_PROVIDER_TOKEN = 'OCR_PROVIDER_TOKEN';

import { Injectable, Logger } from '@nestjs/common';
import { OcrProvider, OcrInput, OcrResult } from './ocr.interface';

@Injectable()
export class MockOcrProvider implements OcrProvider {
  name = 'MockOcrProvider';
  private readonly logger = new Logger(MockOcrProvider.name);

  async processDocument(input: OcrInput): Promise<OcrResult> {
    const startTime = Date.now();
    this.logger.log(`Executing OCR processing stub for document: ${input.documentId} (${input.fileName})`);

    // Simulate OCR text extraction based on filename or typical medical document content
    const lowerName = input.fileName.toLowerCase();
    let title = 'General Medical Document';
    let category = 'OTHER';
    let facility = 'Apex Healthcare Institute';
    let provider = 'Dr. Sarah Jenkins, MD';

    if (lowerName.includes('blood') || lowerName.includes('lab') || lowerName.includes('cbc')) {
      title = 'Complete Blood Count (CBC) Panel';
      category = 'LAB_REPORT';
      facility = 'Metropolis Diagnostic Laboratories';
      provider = 'Dr. Robert Chen, Pathologist';
    } else if (lowerName.includes('presc') || lowerName.includes('rx')) {
      title = 'Outpatient Medical Prescription';
      category = 'PRESCRIPTION';
      provider = 'Dr. Emily Vance, MD';
      facility = 'CarePath Family Clinic';
    } else if (lowerName.includes('xray') || lowerName.includes('chest') || lowerName.includes('rad')) {
      title = 'Chest X-Ray Posteroanterior (PA) View';
      category = 'XRAY';
      facility = 'St. Jude Imaging Center';
      provider = 'Dr. Marcus Webb, Radiologist';
    } else if (lowerName.includes('mri')) {
      title = 'Brain MRI with Contrast';
      category = 'MRI';
      facility = 'Advanced Neuroimaging Center';
      provider = 'Dr. Alistair Finch, Neurologist';
    }

    const rawText = `
--- MEDICAL EXAMINATION REPORT ---
Facility: ${facility}
Consultant: ${provider}
Title: ${title}
Date: ${new Date().toISOString().split('T')[0]}
Category: ${category}

PATIENT OBSERVATIONS & CLINICAL NOTES:
Vital signs within normal physiological limits.
No acute pathology detected upon diagnostic evaluation.
Patient advised regular follow-up and continuation of prescribed regimen.
--- END OF RECORD ---
    `.trim();

    const processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      confidence: 0.96,
      rawText,
      extractedData: {
        reportTitle: title,
        providerName: provider,
        facility,
        documentDate: new Date().toISOString(),
        documentCategory: category,
        findingsSummary: 'Vitals normal, no acute pathology detected.',
        parameters: [
          { name: 'Hemoglobin', value: '14.2', unit: 'g/dL', referenceRange: '13.5-17.5' },
          { name: 'White Blood Cell Count', value: '6.8', unit: 'x10^3/uL', referenceRange: '4.5-11.0' },
          { name: 'Platelets', value: '250', unit: 'x10^3/uL', referenceRange: '150-450' },
        ],
      },
      processingTimeMs,
    };
  }
}

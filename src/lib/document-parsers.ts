import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { parsePDF } from './pdf-parser';
import { Document as DbDocument } from './db';
import { v4 as uuidv4 } from 'uuid';

export type DocType = 'pdf' | 'image' | 'docx' | 'xlsx' | 'csv' | 'text' | 'markdown' | 'unknown';

export async function parseDocument(file: File): Promise<Omit<DbDocument, 'sizeBytes' | 'uploadedAt'> & { fileType: DocType }> {
  const arrayBuffer = await file.arrayBuffer();
  const fileType = detectFileType(file);
  console.log('[Parser] name:', file.name, '| mime:', file.type, '| detected:', fileType);
  const id = uuidv4();

  let extractedText = '';
  let blobData: string | undefined;

  switch (fileType) {
    case 'pdf':
      const pdf = await parsePDF(arrayBuffer);
      extractedText = pdf.fullText;
      if (pdf.isScanned) {
        extractedText = "[Note: This PDF appears to be a scanned image without selectable text. Consider uploading the pages as images to use the Vision AI for analysis.]";
      }
      break;

    case 'docx':
      const result = await mammoth.extractRawText({ arrayBuffer });
      extractedText = result.value;
      break;

    case 'xlsx':
    case 'csv':
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      extractedText = workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        return `--- Sheet: ${sheetName} ---\n` + XLSX.utils.sheet_to_csv(sheet);
      }).join('\n\n');
      break;

    case 'text':
    case 'markdown':
      extractedText = new TextDecoder().decode(arrayBuffer);
      console.log('[Parser] extracted length:', extractedText.length);
      break;

    case 'image':
      // Text extraction happens on-demand via the vision model later
      extractedText = "[Image Document - Analyze with AI to extract description]";
      blobData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      break;

    default:
      extractedText = "[Unsupported file format]";
  }

  return {
    id,
    name: file.name,
    type: fileType,
    extractedText,
    fileType,
    blobData
  };
}

function detectFileType(file: File): DocType {
  const type = file.type;
  const name = file.name.toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx')) return 'xlsx';
  if (type === 'text/csv' || name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.txt')) return 'text';
  if (type.startsWith('text/')) return 'text';

  return 'unknown';
}

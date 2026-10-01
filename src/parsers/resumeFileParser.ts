import type { ResumeFileType } from '../types'
import { parseDocxResume } from './docxResumeParser'
import { PdfPageGeometryError } from './pdfParserErrors'
import { parsePdfResume } from './pdfResumeParser'
import type { ParsedResumeFile } from './resumeParserTypes'

export const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024
const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export class ResumeFileError extends Error {
  constructor(
    public readonly code:
      | 'UNSUPPORTED_FILE'
      | 'FILE_TOO_LARGE'
      | 'EMPTY_FILE'
      | 'SCANNED_PDF'
      | 'PARSE_FAILED'
      | 'PDF_PAGE_GEOMETRY_UNSUPPORTED'
      | 'PDF_PAGE_GEOMETRY_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export function validateResumeFile(file: File): ResumeFileType {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  const isPdf = extension === 'pdf' && (!file.type || file.type === 'application/pdf' || file.type === 'application/octet-stream')
  const isDocx = extension === 'docx' && (!file.type || file.type === docxMime || file.type === 'application/octet-stream')
  if (!isPdf && !isDocx) throw new ResumeFileError('UNSUPPORTED_FILE', '目前僅支援 PDF 與 DOCX 履歷。')
  if (file.size === 0) throw new ResumeFileError('EMPTY_FILE', '履歷檔案沒有內容，請重新選擇。')
  if (file.size > MAX_RESUME_FILE_SIZE) throw new ResumeFileError('FILE_TOO_LARGE', '履歷檔案過大，請使用 10 MB 以下的 PDF 或 DOCX。')
  return isPdf ? 'pdf' : 'docx'
}

export async function parseResumeFile(file: File): Promise<ParsedResumeFile> {
  const fileType = validateResumeFile(file)
  try {
    const parsed = fileType === 'pdf' ? await parsePdfResume(file) : await parseDocxResume(file)
    const meaningfulLength = parsed.text.replace(/\s/g, '').length
    if (fileType === 'pdf' && meaningfulLength < 40) {
      throw new ResumeFileError('SCANNED_PDF', '這份 PDF 可能是掃描圖片，目前版本無法讀取其中的文字。請改用可選取文字的 PDF 或 DOCX。')
    }
    if (meaningfulLength < 10) throw new ResumeFileError('PARSE_FAILED', '履歷中沒有足夠的可解析文字。')
    return parsed
  } catch (error) {
    if (error instanceof ResumeFileError) throw error
    if (error instanceof PdfPageGeometryError) {
      const message = error.category === 'PDF_PAGE_GEOMETRY_UNSUPPORTED'
        ? `PDF 第 ${error.pageNumber} 頁的頁面方向目前不支援。`
        : `PDF 第 ${error.pageNumber} 頁的頁面資訊無法安全解析。`
      throw new ResumeFileError(error.category, message, { cause: error })
    }
    throw new ResumeFileError('PARSE_FAILED', `${fileType.toUpperCase()} 履歷無法讀取，請確認檔案沒有損壞。`, { cause: error })
  }
}

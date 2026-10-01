interface PdfLineFragment {
  text: string
  x: number
  y: number
  fontSize?: number
}

interface AnonymousPdfPageOptions {
  mediaBox?: readonly [number, number, number, number]
  rotate?: 0 | 90 | 180 | 270
  userUnit?: number
}

const escapePdfText = (value: string) => value.replace(/([\\()])/g, '\\$1')

export function anonymousPdfFile(
  name: string,
  fragments: PdfLineFragment[],
  options: AnonymousPdfPageOptions = {},
): File {
  const content = fragments.map(({ text, x, y, fontSize = 12 }) => [
    'BT',
    `/F1 ${fontSize} Tf`,
    `1 0 0 1 ${x} ${y} Tm`,
    `(${escapePdfText(text)}) Tj`,
    'ET',
  ].join('\n')).join('\n')

  const mediaBox = options.mediaBox ?? [0, 0, 612, 792]
  const rotateEntry = options.rotate === undefined ? '' : ` /Rotate ${options.rotate}`
  const userUnitEntry = options.userUnit === undefined ? '' : ` /UserUnit ${options.userUnit}`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox.join(' ')}]${rotateEntry}${userUnitEntry} /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new File([new TextEncoder().encode(pdf)], name, { type: 'application/pdf' })
}

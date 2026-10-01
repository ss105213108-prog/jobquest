export interface AnonymousPdfTextRun {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontName: string
  direction: 'ltr'
  hasEOL: boolean
}

export interface AnonymousPdfLayoutCase {
  id: string
  description: string
  runs: AnonymousPdfTextRun[]
  expectedText: string
}

const run = (
  text: string,
  x: number,
  y: number,
  width: number,
  options: Partial<Pick<AnonymousPdfTextRun, 'height' | 'fontName' | 'hasEOL'>> = {},
): AnonymousPdfTextRun => ({
  text,
  x,
  y,
  width,
  height: options.height ?? 12,
  fontName: options.fontName ?? 'AnonymousBody',
  direction: 'ltr',
  hasEOL: options.hasEOL ?? false,
})

export const anonymousPdfLayouts: AnonymousPdfLayoutCase[] = [
  {
    id: 'single-column',
    description: 'single-column resume',
    runs: [
      run('Avery Stone', 48, 760, 72, { hasEOL: true }),
      run('Skills', 48, 728, 32, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('React TypeScript', 48, 708, 92, { hasEOL: true }),
      run('Education', 48, 676, 50, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('Example University', 48, 656, 105, { hasEOL: true }),
      run('Computer Science', 48, 636, 92, { hasEOL: true }),
    ],
    expectedText: 'Avery Stone\nSkills\nReact TypeScript\nEducation\nExample University\nComputer Science',
  },
  {
    id: 'two-column',
    description: 'two-column resume',
    runs: [
      run('Jordan Vale', 48, 770, 66, { hasEOL: true }),
      run('Skills', 48, 730, 32, { fontName: 'AnonymousHeading' }),
      run('Experience', 286, 730, 58, { fontName: 'AnonymousHeading' }),
      run('React TypeScript', 48, 708, 92),
      run('Orbit Company - Frontend Engineer', 286, 708, 180),
      run('Education', 48, 686, 50, { fontName: 'AnonymousHeading' }),
      run('2022/01 - 2024/06', 286, 686, 106),
      run('Example University', 48, 664, 105, { hasEOL: true }),
    ],
    expectedText: 'Jordan Vale\nSkills\nReact TypeScript\nEducation\nExample University\nExperience\nOrbit Company - Frontend Engineer\n2022/01 - 2024/06',
  },
  {
    id: 'sidebar',
    description: 'sidebar resume with main content',
    runs: [
      run('Morgan Lake', 220, 770, 74, { hasEOL: true }),
      run('Skills', 36, 730, 32, { fontName: 'AnonymousHeading' }),
      run('Experience', 220, 730, 58, { fontName: 'AnonymousHeading' }),
      run('React CSS Git', 36, 708, 72),
      run('Harbor Company - UI Engineer', 220, 708, 158),
      run('Education', 36, 686, 50, { fontName: 'AnonymousHeading' }),
      run('2021/03 - 2024/08', 220, 686, 106),
      run('Sample College', 36, 664, 82, { hasEOL: true }),
    ],
    expectedText: 'Morgan Lake\nExperience\nHarbor Company - UI Engineer\n2021/03 - 2024/08\nSkills\nReact CSS Git\nEducation\nSample College',
  },
  {
    id: 'same-y-separate-columns',
    description: 'same-Y text in separate visual columns',
    runs: [
      run('Portfolio Summary', 42, 710, 94),
      run('Experience', 300, 710, 58, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('North Company - Web Developer', 300, 688, 164, { hasEOL: true }),
      run('2023/01 - 2025/05', 300, 668, 106, { hasEOL: true }),
    ],
    expectedText: 'Portfolio Summary\nExperience\nNorth Company - Web Developer\n2023/01 - 2025/05',
  },
  {
    id: 'split-cjk-heading',
    description: 'CJK heading split into contiguous text items',
    runs: [
      run('工作', 48, 710, 24, { fontName: 'AnonymousHeading' }),
      run('經', 72, 710, 12, { fontName: 'AnonymousHeading' }),
      run('驗', 84, 710, 12, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('星河公司 - 前端工程師', 48, 688, 132, { hasEOL: true }),
      run('2022/02 - 2025/02', 48, 668, 106, { hasEOL: true }),
    ],
    expectedText: '工作經驗\n星河公司 - 前端工程師\n2022/02 - 2025/02',
  },
  {
    id: 'inline-heading-content',
    description: 'inline heading and content with a font change',
    runs: [
      run('Skills:', 48, 710, 36, { fontName: 'AnonymousHeading' }),
      run('React TypeScript', 88, 710, 92, { fontName: 'AnonymousBody', hasEOL: true }),
      run('Education:', 48, 688, 54, { fontName: 'AnonymousHeading' }),
      run('Example University', 106, 688, 105, { fontName: 'AnonymousBody', hasEOL: true }),
    ],
    expectedText: 'Skills: React TypeScript\nEducation: Example University',
  },
  {
    id: 'multiple-work-experiences',
    description: 'three work experience entries',
    runs: [
      run('Experience', 48, 750, 58, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('Alpha Company - Frontend Engineer', 48, 728, 184, { hasEOL: true }),
      run('2020/01 - 2021/06', 48, 708, 106, { hasEOL: true }),
      run('Beacon Company - UI Designer', 48, 680, 164, { hasEOL: true }),
      run('2021/07 - 2023/03', 48, 660, 106, { hasEOL: true }),
      run('Cedar Company - Web Developer', 48, 632, 166, { hasEOL: true }),
      run('2023/04 - present', 48, 612, 98, { hasEOL: true }),
    ],
    expectedText: 'Experience\nAlpha Company - Frontend Engineer\n2020/01 - 2021/06\nBeacon Company - UI Designer\n2021/07 - 2023/03\nCedar Company - Web Developer\n2023/04 - present',
  },
  {
    id: 'multiple-projects',
    description: 'multiple project blocks',
    runs: [
      run('Projects', 48, 750, 44, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('Project Name: Atlas Board', 48, 728, 134, { hasEOL: true }),
      run('Technologies: React TypeScript', 48, 708, 172, { hasEOL: true }),
      run('Project Name: Beacon Portal', 48, 680, 142, { hasEOL: true }),
      run('Technologies: Vue JavaScript', 48, 660, 154, { hasEOL: true }),
      run('Project Name: Cedar API', 48, 632, 124, { hasEOL: true }),
      run('Technologies: Node.js PostgreSQL', 48, 612, 184, { hasEOL: true }),
    ],
    expectedText: 'Projects\nProject Name: Atlas Board\nTechnologies: React TypeScript\nProject Name: Beacon Portal\nTechnologies: Vue JavaScript\nProject Name: Cedar API\nTechnologies: Node.js PostgreSQL',
  },
  {
    id: 'english-headings',
    description: 'English headings and Latin word spacing',
    runs: [
      run('Taylor Quinn', 48, 760, 72, { hasEOL: true }),
      run('Work', 48, 728, 28, { fontName: 'AnonymousHeading' }),
      run('Experience', 82, 728, 58, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('Delta Company - Software Engineer', 48, 706, 178, { hasEOL: true }),
      run('2022/01 - current', 48, 686, 98, { hasEOL: true }),
      run('Projects', 48, 654, 44, { fontName: 'AnonymousHeading', hasEOL: true }),
      run('Project Name: English Demo', 48, 632, 142, { hasEOL: true }),
      run('Technologies: React Git', 48, 612, 128, { hasEOL: true }),
    ],
    expectedText: 'Taylor Quinn\nWork Experience\nDelta Company - Software Engineer\n2022/01 - current\nProjects\nProject Name: English Demo\nTechnologies: React Git',
  },
]

export const layoutById = (id: string): AnonymousPdfLayoutCase => {
  const layout = anonymousPdfLayouts.find((candidate) => candidate.id === id)
  if (!layout) throw new Error(`Unknown anonymous PDF layout: ${id}`)
  return layout
}

export interface SkillDefinition {
  canonical: string
  aliases: string[]
  group: 'frontend' | 'backend' | 'database' | 'cloud' | 'tools' | 'ai-data'
}

export const skillDictionary: SkillDefinition[] = [
  { canonical: 'HTML', aliases: ['HTML', 'HTML5'], group: 'frontend' },
  { canonical: 'CSS', aliases: ['CSS', 'CSS3'], group: 'frontend' },
  { canonical: 'SCSS', aliases: ['SCSS'], group: 'frontend' },
  { canonical: 'Sass', aliases: ['Sass'], group: 'frontend' },
  { canonical: 'JavaScript', aliases: ['JavaScript', 'React Native JS', 'JS'], group: 'frontend' },
  { canonical: 'TypeScript', aliases: ['TypeScript', 'TS'], group: 'frontend' },
  { canonical: 'React', aliases: ['React.js', 'ReactJS', 'React'], group: 'frontend' },
  { canonical: 'Vue', aliases: ['Vue.js', 'VueJS', 'Vue'], group: 'frontend' },
  { canonical: 'Angular', aliases: ['Angular'], group: 'frontend' },
  { canonical: 'Next.js', aliases: ['Next.js', 'NextJS'], group: 'frontend' },
  { canonical: 'Nuxt', aliases: ['Nuxt.js', 'NuxtJS', 'Nuxt'], group: 'frontend' },
  { canonical: 'jQuery', aliases: ['jQuery'], group: 'frontend' },
  { canonical: 'Bootstrap', aliases: ['Bootstrap'], group: 'frontend' },
  { canonical: 'Tailwind CSS', aliases: ['Tailwind CSS', 'TailwindCSS', 'Tailwind'], group: 'frontend' },
  { canonical: 'Node.js', aliases: ['Node.js', 'NodeJS'], group: 'backend' },
  { canonical: 'Express', aliases: ['Express.js', 'ExpressJS', 'Express'], group: 'backend' },
  { canonical: 'PHP', aliases: ['PHP'], group: 'backend' },
  { canonical: 'Laravel', aliases: ['Laravel'], group: 'backend' },
  { canonical: 'Python', aliases: ['Python'], group: 'backend' },
  { canonical: 'Django', aliases: ['Django'], group: 'backend' },
  { canonical: 'Flask', aliases: ['Flask'], group: 'backend' },
  { canonical: 'Java', aliases: ['Java'], group: 'backend' },
  { canonical: 'Spring', aliases: ['Spring Boot', 'Spring'], group: 'backend' },
  { canonical: 'C#', aliases: ['C#', 'C Sharp'], group: 'backend' },
  { canonical: 'C++', aliases: ['C++', 'CPP'], group: 'backend' },
  { canonical: 'C', aliases: ['C'], group: 'backend' },
  { canonical: '.NET', aliases: ['.NET Core', '.NET'], group: 'backend' },
  { canonical: 'MySQL', aliases: ['MySQL'], group: 'database' },
  { canonical: 'PostgreSQL', aliases: ['PostgreSQL', 'Postgres'], group: 'database' },
  { canonical: 'SQLite', aliases: ['SQLite'], group: 'database' },
  { canonical: 'SQL', aliases: ['SQL'], group: 'database' },
  { canonical: 'MongoDB', aliases: ['MongoDB', 'Mongo'], group: 'database' },
  { canonical: 'Supabase', aliases: ['Supabase'], group: 'database' },
  { canonical: 'Firebase', aliases: ['Firebase'], group: 'database' },
  { canonical: 'REST API', aliases: ['RESTful APIs', 'RESTful API', 'REST APIs', 'REST API'], group: 'cloud' },
  { canonical: 'GraphQL', aliases: ['GraphQL'], group: 'cloud' },
  { canonical: 'AWS', aliases: ['Amazon Web Services', 'AWS'], group: 'cloud' },
  { canonical: 'Azure', aliases: ['Microsoft Azure', 'Azure'], group: 'cloud' },
  { canonical: 'GCP', aliases: ['Google Cloud Platform', 'Google Cloud', 'GCP'], group: 'cloud' },
  { canonical: 'Cloudflare', aliases: ['Cloudflare'], group: 'cloud' },
  { canonical: 'Git', aliases: ['Git'], group: 'tools' },
  { canonical: 'GitHub', aliases: ['GitHub'], group: 'tools' },
  { canonical: 'GitLab', aliases: ['GitLab'], group: 'tools' },
  { canonical: 'Docker', aliases: ['Docker'], group: 'tools' },
  { canonical: 'Vite', aliases: ['Vite'], group: 'tools' },
  { canonical: 'Webpack', aliases: ['Webpack'], group: 'tools' },
  { canonical: 'Storybook', aliases: ['Storybook'], group: 'tools' },
  { canonical: 'Testing Library', aliases: ['React Testing Library', 'Testing Library'], group: 'tools' },
  { canonical: 'Linux', aliases: ['Linux'], group: 'tools' },
  { canonical: 'npm', aliases: ['npm'], group: 'tools' },
  { canonical: 'pnpm', aliases: ['pnpm'], group: 'tools' },
  { canonical: 'OpenAI API', aliases: ['OpenAI API'], group: 'ai-data' },
  { canonical: 'AI', aliases: ['Artificial Intelligence', 'AI'], group: 'ai-data' },
  { canonical: 'LLM', aliases: ['Large Language Model', 'LLM'], group: 'ai-data' },
  { canonical: 'Pandas', aliases: ['Pandas'], group: 'ai-data' },
  { canonical: 'NumPy', aliases: ['NumPy', 'Numpy'], group: 'ai-data' },
  { canonical: 'PyTorch', aliases: ['PyTorch'], group: 'ai-data' },
  { canonical: 'Airflow', aliases: ['Apache Airflow', 'Airflow'], group: 'ai-data' },
  { canonical: 'BigQuery', aliases: ['Google BigQuery', 'BigQuery'], group: 'ai-data' },
]

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function canonicalizeSkill(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (!normalized) return ''
  const definition = skillDictionary.find((item) => item.aliases.some((alias) => new RegExp(`^${escapeRegex(alias)}$`, 'iu').test(normalized)))
  return definition?.canonical ?? normalized
}

export function normalizeSkillList(values: string[]): string[] {
  return [...new Set(values.map(canonicalizeSkill).filter(Boolean))]
}

export function skillAliasPattern(alias: string, global = false): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}+#.])${escapeRegex(alias)}(?![\\p{L}\\p{N}+#])`, global ? 'giu' : 'iu')
}

export function detectSkills(text: string) {
  const skills: string[] = []
  const aliasMatches: Array<{ alias: string; canonical: string }> = []

  for (const definition of skillDictionary) {
    const matchedAlias = [...definition.aliases]
      .sort((a, b) => b.length - a.length)
      .find((alias) => skillAliasPattern(alias).test(text))
    if (!matchedAlias) continue
    skills.push(definition.canonical)
    if (matchedAlias.toLocaleLowerCase() !== definition.canonical.toLocaleLowerCase()) {
      aliasMatches.push({ alias: matchedAlias, canonical: definition.canonical })
    }
  }

  return { skills, aliasMatches }
}

'use client'

const FORMAT_COLORS: Record<string, string> = {
  markdown: 'bg-blue-50 text-blue-600 border-blue-100',
  html: 'bg-orange-50 text-orange-600 border-orange-100',
  jsx: 'bg-violet-50 text-violet-600 border-violet-100',
  svg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  csv: 'bg-amber-50 text-amber-600 border-amber-100',
  json: 'bg-slate-100 text-slate-600 border-slate-200',
  lottie: 'bg-pink-50 text-pink-600 border-pink-100',
  p5: 'bg-teal-50 text-teal-600 border-teal-100',
  reveal: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  glsl: 'bg-rose-50 text-rose-600 border-rose-100',
  txt: 'bg-blue-50 text-blue-600 border-blue-100',
}

function displayFormat(fmt: string): string {
  return fmt === 'txt' ? 'markdown' : fmt
}

export function FormatBadge({ format }: { format: string }) {
  const colors = FORMAT_COLORS[format] || 'bg-zinc-100 text-zinc-500 border-zinc-200'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-md border ${colors}`}>
      {displayFormat(format)}
    </span>
  )
}

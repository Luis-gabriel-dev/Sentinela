import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'

/** Markdown das respostas da IA. HTML cru é ignorado (react-markdown não o executa). */
export function Markdown({
  children,
  className
}: {
  children: string
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'space-y-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold',
        '[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
        '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_table]:w-full [&_table]:text-left [&_td]:border-b [&_td]:py-1 [&_td]:pr-3 [&_th]:border-b [&_th]:py-1 [&_th]:pr-3',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

import ReactMarkdown from 'react-markdown';

// One short piece of lesson feedback with light markdown — mainly `code` spans —
// rendered inline (no paragraph wrapper), so it can sit inside a sentence.
export function Inline({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
        code: ({ children }) => (
          <code className="rounded-md border border-line bg-base/60 px-1.5 py-px font-mono text-[0.9em] text-ion-soft [font-variant-ligatures:none]">
            {children}
          </code>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

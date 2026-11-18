"use client";

import ReactMarkdown from "react-markdown";

/**
 * ForgeMarkdown — maximalist markdown rendering for the SKILL.MD preview tab.
 */
export function ForgeMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mb-4 border-b-4 border-forge-ink pb-2 font-display text-2xl leading-tight sm:text-3xl">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-7 mb-3 flex items-center gap-2.5 font-display text-xl leading-tight sm:text-2xl">
            <span
              aria-hidden
              className="inline-block h-5 w-3.5 shrink-0 border-2 border-forge-ink bg-forge-orange"
            />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-5 mb-2 font-display text-lg leading-tight">
            <span aria-hidden className="mr-2 text-forge-magenta">
              ▚
            </span>
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-3 text-sm leading-relaxed sm:text-[15px]">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-4 list-square pl-6 marker:text-forge-magenta">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 list-decimal pl-6 marker:font-display marker:text-forge-orange">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="mb-1.5 text-sm leading-relaxed sm:text-[15px]">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-black">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="font-semibold text-forge-orange not-italic">
            {children}
          </em>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            className="font-bold text-forge-magenta underline decoration-2 underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-l-4 border-forge-magenta bg-forge-magenta/10 py-1 pl-4">
            {children}
          </blockquote>
        ),
        pre: ({ children }) => (
          <pre className="md-pre forge-scroll mb-4 overflow-x-auto border-[3px] border-forge-ink bg-forge-ink p-4 font-mono text-xs leading-relaxed text-forge-lime hard-shadow-sm">
            {children}
          </pre>
        ),
        code: ({ children, className }) => (
          <code
            className={`${
              className?.includes("language-")
                ? "font-mono"
                : "border border-forge-ink bg-forge-yellow px-1 py-0.5 font-mono text-xs font-bold"
            }`}
          >
            {children}
          </code>
        ),
        hr: () => (
          <hr className="my-6 border-t-4 border-dashed border-forge-ink/60" />
        ),
        table: ({ children }) => (
          <div className="forge-scroll-paper mb-4 overflow-x-auto">
            <table className="w-full border-collapse border-[3px] border-forge-ink text-sm">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-2 border-forge-ink bg-forge-ink px-3 py-2 text-left font-display text-xs uppercase tracking-wider text-forge-lime">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-2 border-forge-ink px-3 py-2 align-top text-xs sm:text-sm">
            {children}
          </td>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

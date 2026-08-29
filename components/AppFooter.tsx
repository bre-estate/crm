const YEAR = 2026;

function shortSha(): string | null {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    null;
  return sha ? sha.slice(0, 7) : null;
}

function envBadge(): { label: string; cls: string } | null {
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (env === "preview")
    return { label: "Preview", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  if (env === "development")
    return { label: "Dev", cls: "bg-slate-200 text-slate-700 border-slate-300" };
  return null;
}

export default function AppFooter() {
  const sha = shortSha();
  const env = envBadge();
  return (
    <footer className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-6 pb-2 text-[11px] text-slate-400 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <span>© {YEAR} BRE</span>
      <span aria-hidden>·</span>
      <span>CRM nội bộ</span>
      {sha && (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono">build {sha}</span>
        </>
      )}
      {env && (
        <span
          className={`inline-flex items-center border rounded px-1.5 py-0.5 ${env.cls}`}
        >
          {env.label}
        </span>
      )}
    </footer>
  );
}

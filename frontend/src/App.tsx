import { useEffect, useState } from 'react';

// The Web API base URL. Set VITE_API_URL in .env; falls back to local dev.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type BackendStatus = 'checking' | 'ok' | 'down';

export default function App() {
  const [status, setStatus] = useState<BackendStatus>('checking');

  // Prove the frontend can reach the backend. This is a skeleton check; real
  // data fetching (with auth + React Query) arrives with the actual screens.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then(() => !cancelled && setStatus('ok'))
      .catch(() => !cancelled && setStatus('down'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">
        <span className="text-primary-fg">Skill</span>Quest
      </h1>
      <p className="max-w-md text-center text-content-muted">
        Level up from student to placement-ready. Learn Java + DSA by doing.
      </p>
      <button
        type="button"
        className="min-h-[44px] rounded-lg bg-primary-bg px-5 py-3 font-medium text-content hover:bg-primary-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg"
      >
        Start your quest
      </button>
      <BackendStatusPill status={status} />
    </main>
  );
}

function BackendStatusPill({ status }: { status: BackendStatus }) {
  const map = {
    checking: { text: 'Checking backend…', color: 'text-content-muted' },
    ok: { text: 'Backend: connected', color: 'text-success' },
    down: { text: 'Backend: unreachable', color: 'text-danger' },
  } as const;
  const s = map[status];
  return <span className={`text-sm ${s.color}`}>{s.text}</span>;
}

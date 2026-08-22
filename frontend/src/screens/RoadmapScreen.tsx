import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { RoadmapView } from '../features/roadmap/RoadmapView';
import type { RoadmapNode } from '../features/roadmap/types';

// The roadmap screen with REAL data: fetches the student's persisted plan from
// GET /api/roadmap and renders it with the same RoadmapView built earlier.
export function RoadmapScreen() {
  const [nodes, setNodes] = useState<RoadmapNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ nodes: RoadmapNode[] }>('/api/roadmap')
      .then((r) => setNodes(r.nodes))
      .catch(() => setError('Could not load your roadmap.'));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-8">
        <span className="text-lg font-bold">
          <span className="text-primary-fg">Skill</span>Quest
        </span>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="min-h-[44px] text-sm text-content-muted hover:text-content"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p role="alert" className="p-8 text-danger">
          {error}
        </p>
      )}
      {!error && !nodes && <p className="p-8 text-content-muted">Loading your roadmap…</p>}
      {nodes && <RoadmapView nodes={nodes} />}
    </div>
  );
}

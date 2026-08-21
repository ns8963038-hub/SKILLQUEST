import { RoadmapView } from './features/roadmap/RoadmapView';
import { MOCK_ROADMAP } from './features/roadmap/mockRoadmap';

// App shell. For now it previews the roadmap screen with mock data; once auth
// and routing are wired (rest of M1), this becomes the authenticated app frame.
export default function App() {
  return (
    <div className="min-h-screen">
      {/* Top bar with the brand. XP/streak will join it once gamification lands. */}
      <header className="border-b border-line px-4 py-3 sm:px-8">
        <span className="text-lg font-bold">
          <span className="text-primary-fg">Skill</span>Quest
        </span>
      </header>

      {/* The roadmap screen, fed mock data until the live API is connected. */}
      <RoadmapView nodes={MOCK_ROADMAP} />
    </div>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
// Self-hosted variable fonts — bundled with the app rather than loaded from a
// CDN, so they're CSP-safe and still work offline (UI doc §3).
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import App from './App';
import { useMotionPref } from './lib/motionPref';
import './index.css';

// Every Motion animation honours the student's choice: "always" suppresses
// movement, "never" allows it even when the device asks for less (they asked for
// it explicitly in Settings), and "user" follows the device when they haven't
// chosen. Anything animated outside Motion reads the same setting directly.
function MotionGate({ children }: { children: React.ReactNode }) {
  const { choice } = useMotionPref();
  return <MotionConfig reducedMotion={choice === null ? 'user' : choice ? 'always' : 'never'}>{children}</MotionConfig>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionGate>
      <App />
    </MotionGate>
  </StrictMode>,
);

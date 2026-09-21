import { useEffect, useRef } from 'react';
import { useMotionOff } from '../lib/motionPref';

// The living background: slow aurora light plus a faint "neural field" of drifting
// points that link up when they pass close to each other. Your cursor is a neuron
// too — nearby points reach out and connect to it, and are gently drawn toward it.
//
// Performance budget (UI doc §1 "fast, then rich"): one canvas rendered below
// native resolution, ~30fps, paused while the tab is hidden, a single still frame
// with animations off — and it drops itself to ~15fps if the device struggles.
// "Animations off" is the app's own switch (Settings -> Animations), which also
// follows the phone's setting until the student chooses: a slow phone is exactly
// where a student turns it off, and this canvas is the heaviest thing on screen.
export function AmbientBackground({ intensity = 1 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionOff = useMotionOff();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return; // e.g. the test environment

    const reduce = motionOff;
    const SCALE = 0.6; // render at 60% resolution; the soft light hides it
    const pointer = { x: 0.5, y: 0.3, active: false };
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let previous = 0;
    let frameGap = 33; // ms between drawn frames (~30fps)
    let slowFrames = 0;

    type Point = { x: number; y: number; vx: number; vy: number; r: number; phase: number };
    let points: Point[] = [];

    // Size the canvas to the window and scatter the neural-field points.
    const resize = () => {
      width = Math.floor(window.innerWidth * SCALE);
      height = Math.floor(window.innerHeight * SCALE);
      canvas.width = width;
      canvas.height = height;
      const count = Math.round(Math.min(64, (width * height) / 9000) * intensity);
      points = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: Math.random() * 1.1 + 0.3,
        phase: Math.random() * Math.PI * 2,
      }));
      if (reduce) draw(0);
    };

    // A soft light source across the whole canvas (aurora).
    const glow = (x: number, y: number, radius: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(5,7,13,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    };

    // A small light, filling only its own square (cheap enough to draw every frame).
    const spot = (x: number, y: number, radius: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(5,7,13,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    const draw = (time: number) => {
      const s = time / 1000;
      const big = Math.max(width, height);
      ctx.clearRect(0, 0, width, height);

      // Aurora: three slow-drifting light sources; the ion one leans toward the pointer.
      ctx.globalCompositeOperation = 'lighter';
      glow(
        width * (0.2 + 0.05 * Math.sin(s * 0.07)) + (pointer.x - 0.5) * 40,
        height * (0.1 + 0.04 * Math.cos(s * 0.05)) + (pointer.y - 0.3) * 20,
        big * 0.55,
        `rgba(77,124,255,${0.17 * intensity})`,
      );
      glow(width * (0.88 + 0.04 * Math.cos(s * 0.06)), height * (0.32 + 0.06 * Math.sin(s * 0.04)), big * 0.42, `rgba(45,212,191,${0.075 * intensity})`);
      glow(width * (0.55 + 0.06 * Math.sin(s * 0.03)), height * 1.05, big * 0.5, `rgba(139,124,255,${0.08 * intensity})`);
      ctx.globalCompositeOperation = 'source-over';

      // Drift the points (with a little wander so they never settle into a clump).
      if (!reduce) {
        for (const p of points) {
          p.vx += (Math.random() - 0.5) * 0.004;
          p.vy += (Math.random() - 0.5) * 0.004;
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
        }
      }

      // Link near neighbours.
      const link = Math.min(width, height) * 0.17;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i]!;
          const b = points[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.strokeStyle = `rgba(127,168,255,${(1 - d / link) * 0.14 * intensity})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // The cursor is a neuron: nearby points reach out to it and drift toward it.
      if (!reduce && pointer.active) {
        const px = pointer.x * width;
        const py = pointer.y * height;
        const reach = link * 1.35;
        let linked = 0;
        ctx.lineWidth = 0.8;
        for (const p of points) {
          const dx = px - p.x;
          const dy = py - p.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.5 && d < reach) {
            const a = 1 - d / reach;
            ctx.strokeStyle = `rgba(169,196,255,${a * 0.5 * intensity})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(px, py);
            ctx.stroke();
            // A gentle pull toward the cursor, with a speed cap so nothing flies off.
            p.vx += (dx / d) * 0.004 * a;
            p.vy += (dy / d) * 0.004 * a;
            linked++;
          }
          const speed = Math.hypot(p.vx, p.vy);
          if (speed > 0.32) {
            p.vx *= 0.32 / speed;
            p.vy *= 0.32 / speed;
          }
        }
        // The cursor's own glow brightens with every neuron it has connected.
        spot(px, py, link * 0.5, `rgba(127,168,255,${Math.min(0.3, 0.06 + linked * 0.03) * intensity})`);
        ctx.fillStyle = `rgba(238,242,255,${0.8 * intensity})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // The points themselves, twinkling.
      for (const p of points) {
        const twinkle = 0.55 + 0.45 * Math.sin(s * 1.3 + p.phase);
        ctx.fillStyle = `rgba(207,224,255,${0.6 * twinkle * intensity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // Frame loop: idles while the tab is hidden; if the browser can't keep up
    // (frames consistently slower than 50ms), drop to ~15fps to stay smooth.
    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (previous) {
        slowFrames = time - previous > 50 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames > 20) frameGap = 66;
      }
      previous = time;
      if (document.hidden || time - last < frameGap) return;
      last = time;
      draw(time);
    };

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX / window.innerWidth;
      pointer.y = e.clientY / window.innerHeight;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };

    resize();
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [intensity, motionOff]); // turning animations on or off restarts it the right way

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      {/* A vignette that settles the edges into deep space. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,transparent_0%,rgba(5,7,13,0.6)_75%)]"
      />
    </>
  );
}

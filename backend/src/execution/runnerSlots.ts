import { RunnerUnavailableError } from './types';

// ONE QUEUE FOR THE SHARED RUNNER
//
// Every code run in the app — graded submissions, example runs, lesson fill-ins,
// for every student at once — goes through the same public Paiza key. Without a
// limit, 30 students pressing Run together would fire ~90 requests at it and
// risk getting the key throttled for everyone. So runs take a slot: at most
// `size` are in flight across the whole API, the rest wait their turn in order,
// and a run that waits longer than `maxWaitMs` gives up with
// RunnerUnavailableError ("busy, try again") instead of hanging.

export class RunnerSlots {
  private free: number;
  private readonly waiting: { grant: () => void }[] = [];

  constructor(readonly size: number) {
    this.free = size;
  }

  /** Wait for a slot; resolves to the function that gives it back. */
  acquire(maxWaitMs: number): Promise<() => void> {
    if (this.free > 0) {
      this.free--;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const entry = {
        grant: () => {
          clearTimeout(timer);
          resolve(this.releaser());
        },
      };
      const timer = setTimeout(() => {
        const i = this.waiting.indexOf(entry);
        if (i >= 0) this.waiting.splice(i, 1);
        reject(new RunnerUnavailableError(`busy — waited ${Math.round(maxWaitMs / 1000)} s for a free slot`));
      }, maxWaitMs);
      this.waiting.push(entry);
    });
  }

  /** Runs in flight and runs waiting (for tests and logs). */
  get stats(): { inUse: number; queued: number } {
    return { inUse: this.size - this.free, queued: this.waiting.length };
  }

  // Giving a slot back hands it straight to the next waiter, first come first
  // served; calling it twice is harmless.
  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next.grant();
      else this.free++;
    };
  }
}

import { env } from '../env';
import { MockExecutor } from './mockExecutor';
import type { ExecutionService } from './types';

// Pick the execution backend from configuration. Today only the mock exists;
// the Judge0 backend slots in here (same interface) once it's self-hosted, with
// no change to any route that runs code.
let instance: ExecutionService | null = null;

export function getExecutor(): ExecutionService {
  if (instance) return instance;
  switch (env.EXECUTION_BACKEND) {
    case 'mock':
      instance = new MockExecutor();
      break;
    case 'judge0':
      // TODO(M2/M4): return new Judge0Executor() once Judge0 is self-hosted.
      throw new Error('judge0 execution backend not implemented yet');
    default:
      instance = new MockExecutor();
  }
  return instance;
}

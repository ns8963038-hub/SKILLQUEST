import { env } from '../env';
import { MockExecutor } from './mockExecutor';
import { Judge0Executor } from './judge0Executor';
import type { ExecutionService } from './types';

// Pick the execution backend from configuration. The mock is for development;
// Judge0 runs real Java. Both implement the same interface, so no route changes
// when you switch by setting EXECUTION_BACKEND.
let instance: ExecutionService | null = null;

export function getExecutor(): ExecutionService {
  if (instance) return instance;
  switch (env.EXECUTION_BACKEND) {
    case 'judge0':
      if (!env.JUDGE0_URL) {
        throw new Error('EXECUTION_BACKEND=judge0 but JUDGE0_URL is not set');
      }
      instance = new Judge0Executor(
        env.JUDGE0_URL,
        env.JUDGE0_RAPIDAPI_KEY,
        env.JUDGE0_JAVA_LANGUAGE_ID,
      );
      break;
    case 'mock':
    default:
      instance = new MockExecutor();
  }
  return instance;
}

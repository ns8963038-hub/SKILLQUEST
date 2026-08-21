import type { RoadmapNode } from './types';

// Stand-in roadmap data so the screen can be built and reviewed before auth and
// the live API are wired. Mirrors what /ai/roadmap + the Web API will return: a
// plausible early slice of the Java + DSA plan with a mix of statuses.
export const MOCK_ROADMAP: RoadmapNode[] = [
  { skillId: 'java-basics', title: 'Java Basics', weekNumber: 1, position: 0, status: 'completed' },
  { skillId: 'operators-expressions', title: 'Operators & Expressions', weekNumber: 1, position: 1, status: 'completed' },
  { skillId: 'conditionals', title: 'Conditionals', weekNumber: 1, position: 2, status: 'current' },
  { skillId: 'loops', title: 'Loops', weekNumber: 1, position: 3, status: 'locked' },
  { skillId: 'methods', title: 'Methods', weekNumber: 1, position: 4, status: 'locked' },
  { skillId: 'arrays', title: 'Arrays', weekNumber: 2, position: 0, status: 'locked' },
  { skillId: 'strings', title: 'Strings', weekNumber: 2, position: 1, status: 'locked' },
  { skillId: 'oop-basics', title: 'OOP Basics', weekNumber: 2, position: 2, status: 'locked' },
];

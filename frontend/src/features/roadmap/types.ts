// Shared types for the roadmap screen.

// The per-skill progress state, which decides how a node looks and behaves.
//   completed  - the student finished this skill (green, check)
//   current    - the skill they're on right now (violet, pulsing)
//   available  - unlocked (all prerequisites done) but not started
//   locked     - prerequisites not met yet (greyed, padlock)
export type SkillStatus = 'completed' | 'current' | 'available' | 'locked';

// One skill as shown on the roadmap. This is the shape the Web API will return
// by joining /ai/roadmap output (skillId, weekNumber, position) with the skill's
// title and the student's status. For now it's supplied as mock data.
export interface RoadmapNode {
  skillId: string;
  title: string;
  weekNumber: number;
  position: number; // order within the week
  status: SkillStatus;
  // The adaptive tutor's Bayesian Knowledge Tracing estimate, 0..1 (M4). Optional:
  // when the API doesn't send it yet, the UI shows status only — it never
  // invents a percentage.
  mastery?: number;
  levelsTotal?: number; // published levels in this skill
  levelsCompleted?: number; // how many of them this student has finished
}

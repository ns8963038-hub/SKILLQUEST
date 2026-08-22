import type { QuizQuestion } from './scoring';

// The onboarding placement quiz: 12 questions, 3 per topic (PRD F1). Answering
// all 3 of a topic correctly tests the student out of that skill. Kept in the
// frontend for now; can move behind the API later without changing the flow.
// `topicSkillId` must match a skill id in content/skills.json.
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // --- java-basics ---
  {
    id: 'jb-1',
    version: 1,
    topicSkillId: 'java-basics',
    prompt: 'Which keyword declares a constant (unchangeable) variable in Java?',
    options: ['const', 'final', 'static', 'let'],
    correctIndex: 1,
  },
  {
    id: 'jb-2',
    version: 1,
    topicSkillId: 'java-basics',
    prompt: 'What is the default value of an uninitialized int field?',
    options: ['null', '0', 'undefined', 'garbage'],
    correctIndex: 1,
  },
  {
    id: 'jb-3',
    version: 1,
    topicSkillId: 'java-basics',
    prompt: 'Which type stores a single 16-bit Unicode character?',
    options: ['String', 'char', 'byte', 'text'],
    correctIndex: 1,
  },

  // --- loops ---
  {
    id: 'lp-1',
    version: 1,
    topicSkillId: 'loops',
    prompt: 'How many times does: for(int i=0;i<5;i++) run its body?',
    options: ['4', '5', '6', 'infinite'],
    correctIndex: 1,
  },
  {
    id: 'lp-2',
    version: 1,
    topicSkillId: 'loops',
    prompt: 'Which statement immediately exits the nearest enclosing loop?',
    options: ['continue', 'return', 'break', 'exit'],
    correctIndex: 2,
  },
  {
    id: 'lp-3',
    version: 1,
    topicSkillId: 'loops',
    prompt: 'A do-while loop always runs its body at least how many times?',
    options: ['0', '1', '2', 'depends'],
    correctIndex: 1,
  },

  // --- methods ---
  {
    id: 'mt-1',
    version: 1,
    topicSkillId: 'methods',
    prompt: 'What does a method with return type void return?',
    options: ['0', 'null', 'nothing', 'an empty string'],
    correctIndex: 2,
  },
  {
    id: 'mt-2',
    version: 1,
    topicSkillId: 'methods',
    prompt: 'Defining two methods with the same name but different parameters is called…',
    options: ['overriding', 'overloading', 'shadowing', 'hiding'],
    correctIndex: 1,
  },
  {
    id: 'mt-3',
    version: 1,
    topicSkillId: 'methods',
    prompt: 'How are primitive arguments passed to a method in Java?',
    options: ['by reference', 'by value', 'by pointer', 'by name'],
    correctIndex: 1,
  },

  // --- oop-basics ---
  {
    id: 'oo-1',
    version: 1,
    topicSkillId: 'oop-basics',
    prompt: 'Which keyword creates a new object instance?',
    options: ['create', 'make', 'new', 'alloc'],
    correctIndex: 2,
  },
  {
    id: 'oo-2',
    version: 1,
    topicSkillId: 'oop-basics',
    prompt: 'A special method that runs when an object is created is a…',
    options: ['destructor', 'constructor', 'initializer block', 'main method'],
    correctIndex: 1,
  },
  {
    id: 'oo-3',
    version: 1,
    topicSkillId: 'oop-basics',
    prompt: 'Keeping fields private and exposing them via methods is called…',
    options: ['inheritance', 'polymorphism', 'encapsulation', 'abstraction'],
    correctIndex: 2,
  },
];

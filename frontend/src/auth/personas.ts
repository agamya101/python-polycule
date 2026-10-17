export type Role = 'DEPT_OFFICER' | 'EXTENSION_WORKER' | 'KVK_EXPERT' | 'LOCAL_REP';

export interface Persona {
  id: 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
  name: string;
  role: Role;
  roleLabel: string;
  duty: string;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'p1',
    name: 'Asha Kulkarni',
    role: 'DEPT_OFFICER',
    roleLabel: 'Agriculture Department Officer',
    duty: 'Reviews district risk, approves farmer SMS advisories, and oversees case closures.',
  },
  {
    id: 'p2',
    name: 'R. K. Sharma',
    role: 'DEPT_OFFICER',
    roleLabel: 'Agriculture Department Officer',
    duty: 'Co-approver for separation-of-duties review, assigns field tasks, and audits case integrity.',
  },
  {
    id: 'p3',
    name: 'Vikas More',
    role: 'EXTENSION_WORKER',
    roleLabel: 'Extension Worker',
    duty: 'Registers farmer fields, verifies boundaries, reads Soil Health Cards, and drafts advisories.',
  },
  {
    id: 'p4',
    name: 'Dr. Neha Rao',
    role: 'KVK_EXPERT',
    roleLabel: 'KVK Agronomist',
    duty: 'Reviews nutrient & stress diagnostics, conducts field visits, and verifies crop recovery.',
  },
  {
    id: 'p5',
    name: 'Sanjay Patil',
    role: 'LOCAL_REP',
    roleLabel: 'Local Village Representative',
    duty: 'Confirms message delivery in person, visits fields when satellite views are cloudy, and logs ground truth.',
  },
] as const;

export type StudentRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  course: string;
  yearLevel: string;
  section: string;
};

export const fallbackStudents: StudentRecord[] = [
  {
    id: "2601-001",
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan.delacruz@ptc.edu.ph",
    course: "BSIT",
    yearLevel: "2nd Year",
    section: "A",
  },
  {
    id: "2601-002",
    firstName: "Maria",
    lastName: "Santos",
    email: "maria.santos@ptc.edu.ph",
    course: "BSIT",
    yearLevel: "2nd Year",
    section: "A",
  },
  {
    id: "2601-003",
    firstName: "Pedro",
    lastName: "Reyes",
    email: "pedro.reyes@ptc.edu.ph",
    course: "BSEd",
    yearLevel: "3rd Year",
    section: "B",
  },
  {
    id: "2601-004",
    firstName: "Ana",
    lastName: "Lopez",
    email: "ana.lopez@ptc.edu.ph",
    course: "BSBA",
    yearLevel: "1st Year",
    section: "C",
  },
];

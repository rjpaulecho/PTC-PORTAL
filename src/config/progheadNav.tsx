// programHeadNav.ts

export const programHeadSoloLinks = [
  {
    label: "Dashboard",
    path: "/programhead/dashboard",
    icon: "🏠",
  },
];

export const programHeadNavGroups = [
  {
    id: "grade-approval",
    label: "Grade Approval",
    icon: "📋",
    children: [
      {
        label: "Pending Grades",
        path: "/programhead/gradeapproval/pending",
      },
    ],
  },
];

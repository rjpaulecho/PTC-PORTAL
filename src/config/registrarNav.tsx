// registrarNav.ts

export const registrarSoloLinks = [
  {
    label: "Dashboard",
    path: "/registrar/dashboard",
    icon: "🏠",
  },
  {
    label: "Announcement",
    path: "/registrar/announcement/listR",
    icon: "🏠",
  },
];

export const registrarNavGroups = [
  {
    id: "students",
    label: "Student Records",
    icon: "👨‍🎓",
    children: [
      {
        label: "Student List",
        path: "/registrar/student/listR",
      },
      {
        label: "Student Enrollment",
        path: "/registrar/enrollment/management",
        icon: "👨‍🎓",
      },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    icon: "👨‍🎓",
    children: [
      {
        label: "Curriculum",
        path: "/registrar/curriculum/management",
        icon: "👨‍🎓",
      },
      {
        label: "Subjects",
        path: "/registrar/subjects/management",
        icon: "👨‍🎓",
      },
    ],
  },
];

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
];

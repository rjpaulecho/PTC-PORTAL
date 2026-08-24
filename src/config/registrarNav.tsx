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
      {
        label: "Enrollment Period",
        path: "/registrar/enrollment/periodM",
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
        label: "Courses",
        path: "/registrar/course/management",
        icon: "👨‍🎓",
      },
      {
        label: "Curriculum",
        path: "/registrar/curriculum/management",
        icon: "👨‍🎓",
      },
      {
        label: "Departments",
        path: "/registrar/department/management",
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

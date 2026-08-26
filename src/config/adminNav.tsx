export const adminNavGroups = [
  {
    id: "student-management",
    label: "Student Management",
    icon: "",
    children: [
      { label: "Student List", path: "/admin/students/manage" },
      { label: "Student Management", path: "/admin/students/addeditdrop" },
    ],
  },

  {
    id: "user-management",
    label: "User Management",
    icon: "",
    children: [
      { label: "User List", path: "/admin/user/list" },
      { label: "UserActivity", path: "/admin/user/activity" },
      { label: "User Roles", path: "/admin/user/roles" },
    ],
  },
  {
    id: "annoucement-management",
    label: "Announcement",
    icon: "",
    children: [
      { label: "Announcement List", path: "/admin/announcement/list" },
      { label: "Announcement create", path: "/admin/announcement/create" },
    ],
  },
];

export const adminSoloLinks = [
  { label: "Dashboard", path: "/admin/dashboard", icon: "" },
];

// Fake users for now - replace with real API call later
const USERS = [
  { username: "admin@ptc.edu.ph", password: "1234", role: "admin" as const },
  {
    username: "student@ptc.edu.ph",
    password: "5678",
    role: "student" as const,
  },
  {
    username: "faculty@ptc.edu.ph",
    password: "9012",
    role: "faculty" as const,
  }, // ← added
];

export type UserRole = "admin" | "student" | "faculty"; // ← added faculty

export type User = {
  username: string;
  role: UserRole;
};

export const authService = {
  login(username: string, password: string): User | null {
    const user = USERS.find(
      (u) => u.username === username && u.password === password,
    );
    if (!user) return null;
    return { username: user.username, role: user.role };
  },

  saveSession(user: User): void {
    sessionStorage.setItem("user", JSON.stringify(user));
  },

  getSession(): User | null {
    const data = sessionStorage.getItem("user");
    return data ? JSON.parse(data) : null;
  },

  logout(): void {
    sessionStorage.removeItem("user");
  },
};

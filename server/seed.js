import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

async function seed() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    console.log("Connected to database.");

    // Get all roles
    const [roles] = await db.execute("SELECT role_id, role_name FROM roles");

    const roleMap = {};

    for (const role of roles) {
      roleMap[role.role_name] = role.role_id;
    }

    const users = [
      {
        username: "admin",
        email: "admin@ptc.edu.ph",
        password: "12345",
        role: "Admin",
      },
      {
        username: "registrar",
        email: "registrar@ptc.edu.ph",
        password: "12345",
        role: "Registrar",
      },
      {
        username: "proghead",
        email: "proghead@ptc.edu.ph",
        password: "12345",
        role: "Program Head",
      },
      {
        username: "faculty",
        email: "faculty@ptc.edu.ph",
        password: "12345",
        role: "Faculty",
      },
      {
        username: "student",
        email: "student@ptc.edu.ph",
        password: "12345",
        role: "Student",
      },
    ];

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 10);

      const [existing] = await db.execute(
        "SELECT user_id FROM users WHERE username = ?",
        [user.username],
      );

      if (existing.length > 0) {
        console.log(`${user.username} already exists. Skipping...`);
        continue;
      }

      await db.execute(
        `
    INSERT INTO users
    (
      username,
      email,
      password_hash,
      role_id,
      is_verified,
      is_active
    )
    VALUES (?, ?, ?, ?, ?, ?)
    `,
        [
          user.username,
          user.email,
          passwordHash,
          roleMap[user.role],
          true,
          true,
        ],
      );

      console.log(`Seeded ${user.role}: ${user.email}`);
    }
    console.log("Database seeding completed successfully.");
  } catch (err) {
    console.error(err);
  } finally {
    await db.end();
  }
}

seed();

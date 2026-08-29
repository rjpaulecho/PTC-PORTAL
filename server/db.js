// db.js
import "dotenv/config";
import mysql from "mysql2/promise";

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Optional: verify the pool can actually reach the database on startup.
try {
  const conn = await db.getConnection();
  console.log("✅ MySQL Connected");
  conn.release();
} catch (error) {
  console.error("❌ MySQL connection failed:");
  console.error("Message:", error.message);
  console.error("Code:", error.code);
  console.error("Errno:", error.errno);
  console.error("SQL State:", error.sqlState);
}

export default db;

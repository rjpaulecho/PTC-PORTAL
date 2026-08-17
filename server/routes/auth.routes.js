import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import nodemailer from "nodemailer";
import db from "../db.js";
import { logActivity } from "../utils/activityLogger.js";
const router = express.Router();

// =======================
// Nodemailer
// =======================
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false,
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASS,
  },
});

// =======================
// LOGIN
// =======================
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required.",
    });
  }

  try {
    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.password_hash,
        u.role_id,
        u.is_verified,
        u.is_active,
        r.role_name
      FROM users u
      INNER JOIN roles r
        ON u.role_id = r.role_id
      WHERE u.username = ?
      `,
      [username],
    );

    // Username does not exist
    if (rows.length === 0) {
      return res.status(401).json({
        error: "Invalid username or password.",
      });
    }

    const user = rows[0];

    // Wrong password
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      await logActivity(
        user.user_id,
        "FAILED LOGIN",
        "Authentication",
        `${user.username} entered an incorrect password.`,
      );

      return res.status(401).json({
        error: "Invalid username or password.",
      });
    }

    // Account inactive
    if (!user.is_active) {
      await logActivity(
        user.user_id,
        "LOGIN BLOCKED",
        "Authentication",
        `${user.username} attempted to login while inactive.`,
      );

      return res.status(403).json({
        error: "Your account has been deactivated.",
      });
    }

    // Not verified
    if (!user.is_verified) {
      await logActivity(
        user.user_id,
        "LOGIN BLOCKED",
        "Authentication",
        `${user.username} attempted to login before verification.`,
      );

      return res.status(403).json({
        error: "Please verify your account first.",
      });
    }

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    await db.execute(
      `
      UPDATE users
      SET last_login = NOW()
      WHERE user_id = ?
      `,
      [user.user_id],
    );

    await db.execute("DELETE FROM otp_codes WHERE email = ?", [user.email]);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.execute(
      `
      INSERT INTO otp_codes
      (email, otp, expires_at)
      VALUES (?, ?, ?)
      `,
      [user.email, otp, expiresAt],
    );

    const info = await transporter.sendMail({
      from: '"PTC Portal" <noreply@ptc.edu.ph>',
      to: user.email,
      subject: "PTC Portal OTP",
      text: `Your OTP is ${otp}.`,
      html: `
        <div style="font-family:Arial">
          <h2>PTC Portal</h2>
          <p>Your OTP is:</p>
          <h1 style="letter-spacing:5px">${otp}</h1>
          <p>This code expires in 5 minutes.</p>
        </div>
      `,
    });

    console.log("Preview URL:", nodemailer.getTestMessageUrl(info));

    res.json({
      message: "OTP sent successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Server Error",
    });
  }
});
export default router;

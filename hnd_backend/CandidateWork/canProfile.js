const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const db = require("../Database/db");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Ensure uploads/profile directory exists
const uploadDir = path.join(__dirname, "../uploads/profile");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${file.fieldname}${ext}`);
  },
});

const upload = multer({ storage });

// ================= GET PROFILE =================
router.get("/:cand_id", (req, res) => {
  const { cand_id } = req.params;

  const sql = `
    SELECT cand_id, name, email, phone, address, profile_picture
    FROM users
    WHERE cand_id = ?
  `;

  db.query(sql, [cand_id], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!results.length) return res.status(404).json({ message: "Candidate not found" });

    res.json(results[0]);
  });
});

// ================= UPDATE PROFILE =================
router.put("/update/:cand_id", (req, res) => {
  const { cand_id } = req.params;
  const { name, phone, address } = req.body;

  if (!name || !phone) return res.status(400).json({ message: "Invalid profile data" });

  const sql = `
    UPDATE users
    SET name = ?, phone = ?, address = ?
    WHERE cand_id = ?
  `;

  db.query(sql, [name, phone, address || null, cand_id], (err) => {
    if (err) return res.status(500).json({ message: "Profile update failed" });
    res.json({ message: "Profile updated successfully" });
  });
});

// ================= UPDATE PASSWORD =================
router.put("/update-password/:cand_id", async (req, res) => {
  const { cand_id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) return res.status(400).json({ message: "Password required" });

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const sql = `UPDATE users SET password = ? WHERE cand_id = ?`;

    db.query(sql, [hash, cand_id], (err) => {
      if (err) return res.status(500).json({ message: "Password update failed" });
      res.json({ message: "Password updated successfully" });
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= PROFILE PICTURE =================
router.post("/upload-picture/:cand_id", upload.single("profile_picture"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const { cand_id } = req.params;
  const profile_picture = `/uploads/profile/${req.file.filename}`;

  const sql = `UPDATE users SET profile_picture = ? WHERE cand_id = ?`;

  db.query(sql, [profile_picture, cand_id], (err) => {
    if (err) return res.status(500).json({ message: "Image update failed" });
    res.json({ message: "Profile picture updated", profile_picture });
  });
});

module.exports = router;

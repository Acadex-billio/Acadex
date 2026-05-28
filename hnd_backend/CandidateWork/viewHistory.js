const express = require("express");
const router = express.Router();
const db = require("../Database/db");

// Add history entry
router.post("/add", async (req, res) => {
  const conn = db.promise();
  const { user_id, content_type, content_title, action } = req.body;

  if (!user_id || !content_type || !content_title || !action) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields.",
    });
  }

  try {
    await conn.query(
      `INSERT INTO history (user_id, content_type, content_title, action)
       VALUES (?, ?, ?, ?)`,
      [user_id, content_type, content_title, action]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("History insert error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get history by user
router.get("/:user_id", async (req, res) => {
  const conn = db.promise();
  const { user_id } = req.params;

  try {
    const [rows] = await conn.query(
      `SELECT history_id,
              content_type,
              content_title,
              action,
              DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp
       FROM history
       WHERE user_id = ?
       ORDER BY timestamp DESC`,
      [user_id]
    );

    return res.json({ success: true, logs: rows });
  } catch (err) {
    console.error("Fetch history error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const db = require("../Database/db");
const { requireAuth } = require("../middlewares/jwtAuth");

/**
 * GET /api/candidate/dashboard - JWT Protected
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    // Get user ID from JWT token instead of query parameters
    const userId = req.user.cand_id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID not found in token" });
    }

    // ===== USER INFO =====
    const [userRows] = await db.promise().query(
      `
      SELECT 
        u.cand_id,
        u.name,
        u.profile_picture,
        u.dpt_id,
        d.department_name,
        d.abbreviation
      FROM users u
      JOIN dpts d ON u.dpt_id = d.dpt_id
      WHERE u.cand_id = ?
      `,
      [userId]
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userRows[0];

    // ===== QUESTION PAPERS =====
    const [questionPapers] = await db.promise().query(
      `SELECT qp_id AS id, course_title FROM question_papers ORDER BY upload_date DESC LIMIT 5`
    );

    // ===== REPORTS =====
    const [reports] = await db.promise().query(
      `
      SELECT r.report_id AS id, r.title
      FROM reports r
      JOIN report_departments rd ON r.report_id = rd.report_id
      WHERE rd.dpt_id = ?
      ORDER BY r.upload_date DESC LIMIT 5
      `,
      [user.dpt_id]
    );

    // ===== PRESENTATIONS =====
    const [presentations] = await db.promise().query(
      `SELECT presentation_id AS id, title FROM presentations ORDER BY upload_date DESC LIMIT 5`
    );

    // ===== COURSE MATES =====
    const [courseMates] = await db.promise().query(
      `
      SELECT cand_id AS id, name, profile_picture
      FROM users
      WHERE dpt_id = ? AND cand_id != ?
      LIMIT 5
      `,
      [user.dpt_id, userId]
    );

    return res.json({
      success: true,
      user: {
        id: user.cand_id,
        name: user.name,
        profilePicture: user.profile_picture || null,
        department: user.department_name,
        departmentAbbr: user.abbreviation,
        status: "Active",
      },
      questionPapers,
      reports,
      presentations,
      courseMates,
    });
  } catch (err) {
    console.error("[Dashboard Fatal Error]", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

module.exports = router;

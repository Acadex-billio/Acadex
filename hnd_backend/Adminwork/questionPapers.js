// ---------------------------------------------
// QUESTION PAPERS ROUTES
// ---------------------------------------------
const express = require("express");
const router = express.Router();
const db = require("../Database/db");
const path = require("path");
const fs = require("fs");

// ------------------------------------------------------
// GET ALL QUESTION PAPERS
// ------------------------------------------------------
router.get("/get-question-papers", async (_req, res) => {
  const conn = db.promise();

  try {
    const [papers] = await conn.query(`
      SELECT 
        qp.qp_id,
        qp.course_title AS paper_title,
        qp.hnd_year,
        qp.paper_file,
        qp.upload_date,
        qp.uploaded_by,
        qp.audience,
        qp.more_info
      FROM question_papers qp
      ORDER BY qp.qp_id DESC
    `);

    if (!papers.length) {
      return res.json({ papers: [] });
    }

    // Extract all qp_ids
    const ids = papers.map((p) => p.qp_id);
    const placeholders = ids.map(() => "?").join(",");

    const [deptRows] = await conn.query(
      `
      SELECT 
        qpd.qp_id,
        dpts.dpt_id,
        dpts.department_name
      FROM question_paper_departments qpd
      JOIN dpts ON dpts.dpt_id = qpd.dpt_id
      WHERE qpd.qp_id IN (${placeholders})
      `,
      ids
    );

    // Build department map
    const deptMap = {};
    deptRows.forEach((row) => {
      if (!deptMap[row.qp_id]) deptMap[row.qp_id] = [];
      deptMap[row.qp_id].push({
        dpt_id: row.dpt_id,
        dpt_name: row.department_name,
      });
    });

    // Merge response
    const formatted = papers.map((p) => ({
      ...p,
      departments: deptMap[p.qp_id] || [],
    }));

    return res.json({ papers: formatted });
  } catch (error) {
    console.error("get-question-papers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve question papers",
    });
  }
});

// ------------------------------------------------------
// DOWNLOAD QUESTION PAPER FILE (FORCED SAVE DIALOG)
// ------------------------------------------------------
router.get("/download-paper/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../uploads/papers", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    return res.download(filePath, filename, (err) => {
      if (err) {
        console.error("Download error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to download file",
        });
      }
    });
  } catch (error) {
    console.error("download-paper error:", error);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error downloading file",
    });
  }
});

module.exports = router;

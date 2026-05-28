const express = require("express");
const router = express.Router();

/**
 * STRICT NAMESPACING — NO COLLISIONS
 */
router.use("/dashboard", require("../../CandidateWork/canDash"));
router.use("/questions", require("../../CandidateWork/PastQuestion"));
router.use("/presentations", require("../../CandidateWork/canPresentation"));
router.use("/reports", require("../../CandidateWork/viewReport"));
router.use("/history", require("../../CandidateWork/viewHistory"));
router.use("/profile", require("../../CandidateWork/canProfile"));

module.exports = router;

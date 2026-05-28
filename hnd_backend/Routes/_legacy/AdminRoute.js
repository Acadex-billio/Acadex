const express = require('express');
const router = express.Router();

const questionUploadRoutes = require('../../Adminwork/QuestionUpload');
router.use('/', questionUploadRoutes);

const departmentRouter = require('../../Adminwork/dePartment');
router.use('/departments', departmentRouter);

const reportRoutes = require('../../Adminwork/ReportUpload');
router.use('/', reportRoutes);

const presentationRoutes = require('../../Adminwork/UploadPresentation');
router.use('/', presentationRoutes);

const adminDashRoutes = require('../../Adminwork/AdminDash');
router.use('/', adminDashRoutes);

const questionPapersRoutes = require('../../Adminwork/questionPapers');
router.use('/', questionPapersRoutes);

module.exports = router;

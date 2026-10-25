'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AiStudyMaterial = require('../models/AiStudyMaterial');
const QuestionPaper = require('../models/QuestionPaper');

test('study materials preserve active program codes beyond HND and BTS', () => {
  const material = new AiStudyMaterial({
    question_paper_id: new mongoose.Types.ObjectId(),
    paper_title: 'Sample paper',
    program: 'BACHELOR',
    question_count: 5,
    questions: [],
    created_by: 'admin',
  });

  assert.equal(material.validateSync(), undefined);
  assert.equal(material.program, 'BACHELOR');
});

test('question papers accept active program codes managed in the program catalogue', () => {
  const paper = new QuestionPaper({
    course_title: 'Sample paper',
    hnd_year: '2026',
    paper_file: 'sample.pdf',
    program: 'CUSTOM_PROGRAM',
  });

  assert.equal(paper.validateSync(), undefined);
  assert.equal(paper.program, 'CUSTOM_PROGRAM');
});

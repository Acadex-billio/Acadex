import formatStudyOcrDraft from './formatStudyOcrDraft';

test('extracts only complete MCQs from an explicitly labeled section', () => {
  const result = formatStudyOcrDraft(`SECTION A: STRUCTURED QUESTIONS
Q1- Define a mixture.
A- First definition
B- Second definition
C- Third definition
D- Fourth definition
SECTION B: MULTIPLE CHOICE QUESTIONS
1. What is 2 + 2? A) 3 B) 4 C) 5 D) 6
2. Pick the correct choice
A. First
B. Second
C. Third
D. Fourth
SECTION C: STRUCTURAL QUESTIONS
Q3- Explain the answer.
A- Part one
B- Part two
C- Part three
D- Part four`);

  expect(result.detectedQuestionCount).toBe(2);
  expect(result.incompleteQuestionCount).toBe(0);
  expect(result.mcqSectionFound).toBe(true);
  expect(result.missingAnswerCount).toBe(2);
  expect(result.draftText).toContain('Q1- What is 2 + 2?');
  expect(result.draftText).toContain('CORRECT ANSWER:');
  expect(result.draftText).toContain('D- Fourth');
  expect(result.draftText).not.toContain('Define a mixture');
  expect(result.draftText).not.toContain('Explain the answer');
});

test('preserves a recognized answer and reports when no MCQ section exists', () => {
  const formatted = formatStudyOcrDraft(`SECTION A: OBJECTIVE QUESTIONS
Q1: Example question?
A- One
B- Two
C- Three
D- Four
Answer: C`);
  expect(formatted.missingAnswerCount).toBe(0);
  expect(formatted.draftText).toContain('CORRECT ANSWER: C');

  const structuralOnly = formatStudyOcrDraft(`SECTION A: STRUCTURED QUESTIONS
Q1: Define a mixture.
A- One
B- Two
C- Three
D- Four`);
  expect(structuralOnly.mcqSectionFound).toBe(false);
  expect(structuralOnly.detectedQuestionCount).toBe(0);
  expect(structuralOnly.draftText).toBe('');
});

test('reports an identified MCQ section that has no complete option sets', () => {
  const result = formatStudyOcrDraft(`SECTION A: MULTIPLE CHOICE QUESTIONS
1. An incomplete question
A) Option one
B) Option two
C)`);

  expect(result.mcqSectionFound).toBe(true);
  expect(result.detectedQuestionCount).toBe(0);
  expect(result.incompleteQuestionCount).toBe(1);
  expect(result.draftText).toBe('');
});

test('reports the total page count printed in the paper', () => {
  const result = formatStudyOcrDraft(`SECTION A: MULTIPLE CHOICE QUESTIONS
1. Example question?
A) One
B) Two
C) Three
D) Four
Page 6 of 8`);

  expect(result.detectedQuestionCount).toBe(1);
  expect(result.printedPageCount).toBe(8);
});

test('recognizes French QCM section headings', () => {
  const result = formatStudyOcrDraft(`SECTION A: QUESTIONS À CHOIX MULTIPLES
1. Exemple de question?
A) Un
B) Deux
C) Trois
D) Quatre`);

  expect(result.mcqSectionFound).toBe(true);
  expect(result.detectedQuestionCount).toBe(1);
  expect(result.draftText).toContain('Q1- Exemple de question?');
});

test('recovers OCR-confused C options and stops when structural numbering restarts', () => {
  const mcqLines = Array.from({ length: 13 }, (_, index) => {
    const number = index + 1;
    const aOption = number === 10 ? '- a. Option A' : 'a. Option A';
    const cOption = number === 6
      ? '3 ¢. Ms Word'
      : number === 11
        ? '¢c. Option C'
        : '¢. Option C';
    const questionPrefix = number === 6 ? `: ${number}.` : number === 7 || number === 9 ? `${number} ` : `${number}.`;
    return `${questionPrefix} Question ${number}?
${aOption}
b. Option B
${cOption}
d. Option D`;
  }).join('\n');
  const result = formatStudyOcrDraft(`SECTION A: MULTIPLE CHOICE QUESTIONS (20 MARKS)
One Mark For Each Correct Answer
${mcqLines}
3) Write the formula to calculate the total.
a) Structural part one
b) Structural part two
4) Explain the window below.
a) Identify the numbered parts
b) Give the procedure
5) Explain how to use the internet.`);

  expect(result.detectedQuestionCount).toBe(13);
  expect(result.incompleteQuestionCount).toBe(0);
  expect(result.draftText).toContain('C- Option C');
  expect(result.draftText).toContain('C- Ms Word');
  expect(result.draftText).not.toContain('Write the formula');
  expect(result.draftText).not.toContain('Identify the numbered parts');
});

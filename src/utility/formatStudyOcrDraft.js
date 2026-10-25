const SECTION_LINE = /^\s*(?:SECTION|PART)\s+[A-Z0-9]+\b[^.!?]*$/i;
const END_OF_QUESTIONS_LINE = /^\s*(?:MARKING\s+GUIDE|ANSWER\s+KEY|SOLUTIONS?)\b/i;
const QUESTION_LINE = /^\s*[:|!¡]*\s*(?:Q(?:UESTION)?\s*)?(\d{1,3})(?:\s*[).:-]\s*|\s+)(.+)$/i;
const OPTION_LINE = /^\s*(?:[-–—]\s*)?(?:[\d|!Il]\s+)?\(?([A-D]|¢|©)(?:C)?\)?\s*[).:-]\s*(.*)$/i;
const ANSWER_LINE = /^\s*(?:CORRECT\s*ANSWER|ANSWER|R[EÉ]PONSE)\s*[:-]?\s*([A-D])\b/i;
const MCQ_HEADING = /\b(?:multiple[\s-]*choice(?:\s+questions?)?|MCQs?|QCMs?|objective\s+questions?|questions?\s+(?:à|a)\s+choix\s+multiples?)\b/i;
const CHOOSE_ANSWER_HEADING = /\b(?:choose|select|tick|circle)\s+(?:the\s+)?(?:correct|best)\s+(?:answer|option)s?\b/i;
const INLINE_OPTION_MARKER = /(?:^|\s)\(?([A-D]|¢|©)(?:C)?\)?\s*[-.)]\s+/gi;
const PRINTED_PAGE_TOTAL = /\b(?:page|pg)\s*\d{1,3}\s*(?:of|\/)\s*(\d{1,3})\b/gi;

const normalizeOptionKey = (value) => {
  const key = String(value || '').toUpperCase();
  return key === '¢' || key === '©' ? 'C' : key;
};

const hasCompleteOptions = (question) => Object.values(question.options).every(Boolean);

const isMcqHeading = (line) => {
  const value = String(line || '').trim();
  if (!value || value.length > 180 || /[?]$/.test(value)) return false;
  return MCQ_HEADING.test(value) || CHOOSE_ANSWER_HEADING.test(value);
};

const findMcqSections = (lines) => {
  const starts = [];
  lines.forEach((line, index) => {
    if (!isMcqHeading(line)) return;

    let sectionIndex = index;
    for (let previousIndex = index - 1; previousIndex >= Math.max(0, index - 3); previousIndex -= 1) {
      if (SECTION_LINE.test(lines[previousIndex])) {
        sectionIndex = previousIndex;
        break;
      }
      if (lines[previousIndex].trim()) break;
    }
    if (starts.length && sectionIndex <= starts[starts.length - 1]) return;
    starts.push(sectionIndex);
  });

  return starts.map((start, index) => {
    let end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    for (let lineIndex = start + 1; lineIndex < end; lineIndex += 1) {
      if (SECTION_LINE.test(lines[lineIndex]) || END_OF_QUESTIONS_LINE.test(lines[lineIndex])) {
        end = lineIndex;
        break;
      }
    }

    const headingIndex = lines.findIndex((line, lineIndex) =>
      lineIndex >= start && lineIndex < end && isMcqHeading(line)
    );
    return lines.slice(headingIndex >= 0 ? headingIndex + 1 : start + 1, end);
  });
};

const parseQuestionSections = (sections) => {
  const questions = [];
  sections.forEach((sectionLines) => {
    let current = null;
    let currentOption = '';

    const appendText = (text) => {
      const line = String(text || '').trim();
      if (!current || !line) return;

      const answerMatch = line.match(ANSWER_LINE);
      if (answerMatch) {
        current.correct_option = answerMatch[1].toUpperCase();
        currentOption = '';
        return;
      }

      if (/^\s*(?:reason|explanation)\s*[:-]/i.test(line)) {
        current.reason = line.replace(/^\s*(?:reason|explanation)\s*[:-]\s*/i, '').trim();
        currentOption = '';
        return;
      }

      const inlineMarkers = [...line.matchAll(INLINE_OPTION_MARKER)];
      const startsWithOption = OPTION_LINE.test(line);
      if (inlineMarkers.length > 1 || startsWithOption) {
        if (inlineMarkers.length === 1 || (startsWithOption && inlineMarkers.length === 0)) {
          const optionMatch = line.match(OPTION_LINE);
          if (optionMatch) {
            currentOption = normalizeOptionKey(optionMatch[1]);
            current.options[currentOption] = `${current.options[currentOption]} ${optionMatch[2]}`.trim();
            return;
          }
        }

        const prefix = line.slice(0, inlineMarkers[0].index).trim();
        if (prefix) {
          if (currentOption) {
            current.options[currentOption] = `${current.options[currentOption]} ${prefix}`.trim();
          } else {
            current.question_text = `${current.question_text} ${prefix}`.trim();
          }
        }

        inlineMarkers.forEach((marker, index) => {
          const segmentStart = marker.index + marker[0].length;
          const segmentEnd = index + 1 < inlineMarkers.length
            ? inlineMarkers[index + 1].index
            : line.length;
          currentOption = normalizeOptionKey(marker[1]);
          current.options[currentOption] = `${current.options[currentOption]} ${line.slice(segmentStart, segmentEnd)}`.trim();
        });
        return;
      }

      if (currentOption) {
        current.options[currentOption] = `${current.options[currentOption]} ${line}`.trim();
      } else {
        current.question_text = `${current.question_text} ${line}`.trim();
      }
    };

    const finishQuestion = () => {
      if (current?.question_text.trim()) questions.push(current);
      current = null;
      currentOption = '';
    };

    let lastQuestionNumber = null;
    for (const line of sectionLines) {
      const questionMatch = line.match(QUESTION_LINE);
      if (questionMatch && !OPTION_LINE.test(line)) {
        const questionNumber = Number(questionMatch[1]);
        if (
          current
          && hasCompleteOptions(current)
          && lastQuestionNumber !== null
          && questionNumber <= lastQuestionNumber
        ) {
          finishQuestion();
          break;
        }
        finishQuestion();
        lastQuestionNumber = questionNumber;
        current = {
          question_number: questionNumber,
          question_text: '',
          options: { A: '', B: '', C: '', D: '' },
          correct_option: '',
          reason: '',
        };
        appendText(questionMatch[2]);
        continue;
      }
      appendText(line);
    }
    finishQuestion();
  });

  return questions;
};

const formatStudyOcrDraft = (rawText) => {
  const lines = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const sections = findMcqSections(lines);
  const detectedQuestions = parseQuestionSections(sections);
  const questions = detectedQuestions.filter(hasCompleteOptions);
  const printedPageCounts = [...String(rawText || '').matchAll(PRINTED_PAGE_TOTAL)]
    .map((match) => Number(match[1]))
    .filter((count) => Number.isInteger(count) && count > 0);

  const draftText = questions.map((question, index) => [
    `Q${index + 1}- ${question.question_text}`,
    `A- ${question.options.A}`,
    `B- ${question.options.B}`,
    `C- ${question.options.C}`,
    `D- ${question.options.D}`,
    `CORRECT ANSWER: ${question.correct_option}`,
    question.reason ? `Reason: ${question.reason}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  return {
    draftText,
    mcqSectionFound: sections.length > 0,
    detectedQuestionCount: questions.length,
    incompleteQuestionCount: detectedQuestions.length - questions.length,
    missingAnswerCount: questions.filter((question) => !question.correct_option).length,
    printedPageCount: printedPageCounts.length ? Math.max(...printedPageCounts) : null,
  };
};

export default formatStudyOcrDraft;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import GraduationCapLoader from './GraduationCapLoader';
import { FaPaperPlane } from 'react-icons/fa';
import styles from '../Astyles/aiAssistant.module.css';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL_NORMALIZED } from '../config/api';
import api from '../services/api';

const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT = 12000;
const SESSION_STORAGE_PREFIX = 'hnd-ai-chat-session-v1';
const SETTINGS_STORAGE_KEY = 'hnd-ai-chat-settings-v1';
const DEFAULT_SETTINGS = {
  storeConversation: true,
  showSources: false,
  responseLanguage: 'en',
  memoryTurns: 6,
  strictHndMode: true,
  tone: 'balanced',
  answerDepth: 'balanced',
};

const ASSISTANT_MODES = {
  RESEARCH: 'research',
  STUDY: 'study',
};

const PROCESSING_STAGES = {
  en: [
    'Loading in... preparing your assistant workspace.',
    'Analyzing your request... understanding intent and context.',
    'Reviewing HND context... selecting the best answer path.',
    'Drafting response... making it clear and practical.',
    'Almost ready... polishing the final answer.',
  ],
  fr: [
    'Chargement... preparation de votre assistant.',
    'Analyse de votre demande... comprehension de l intention.',
    'Verification du contexte HND... choix de la meilleure reponse.',
    'Redaction de la reponse... claire et pratique.',
    'Presque pret... finalisation de la reponse.',
  ],
};

const safeParse = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const getInitialSettings = () => {
  const parsed = safeParse(localStorage.getItem(SETTINGS_STORAGE_KEY));
  return {
    ...DEFAULT_SETTINGS,
    ...(parsed && typeof parsed === 'object' ? parsed : {}),
  };
};

const createGreetingMessage = (firstName = 'there') => ({
  id: 'greeting',
  role: 'assistant',
  text: `Hi ${firstName}! I'm your Acadex AI Assistant. I can help you with questions about using the platform, accessing materials, managing your account, and file-based questions too. What can I help you with?`,
  sources: [],
  time: nowTime(),
});

const isTextLikeFile = (file) => {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'text/xml'
  ) {
    return true;
  }

  return /\.(txt|md|markdown|json|csv|log|xml|yml|yaml)$/i.test(String(file.name || ''));
};

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });

const AIAssistant = () => {
  const { user } = useAuth();
  const messagesEndRef = useRef(null);
  const currentStreamRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const hasHydratedSessionRef = useRef(false);

  const userFirstName = useMemo(() => user?.name?.split?.(' ')?.[0] || 'there', [user?.name]);
  const userRole = String(user?.role || '').toLowerCase();
  const isCandidateUser = userRole === 'candidate';
  const sessionKey = useMemo(() => {
    const userIdentity =
      user?.cand_id ||
      user?.admin_id ||
      user?.lecturer_id ||
      user?.id ||
      user?._id ||
      user?.email ||
      user?.name ||
      'guest';
    return `${SESSION_STORAGE_PREFIX}:${String(userIdentity).trim().toLowerCase()}`;
  }, [user?.cand_id, user?.admin_id, user?.lecturer_id, user?.id, user?._id, user?.email, user?.name]);

  const initialSettings = useMemo(() => getInitialSettings(), []);

  const [storeConversation, setStoreConversation] = useState(Boolean(initialSettings.storeConversation));
  const [showSources, setShowSources] = useState(Boolean(initialSettings.showSources));
  const [responseLanguage, setResponseLanguage] = useState(
    initialSettings.responseLanguage === 'fr' ? 'fr' : 'en'
  );
  const [memoryTurns, setMemoryTurns] = useState(() => {
    const n = Number(initialSettings.memoryTurns || 6);
    return [3, 4, 5, 6].includes(n) ? n : 6;
  });
  const [strictHndMode, setStrictHndMode] = useState(initialSettings.strictHndMode !== false);
  const [tone, setTone] = useState(
    ['balanced', 'friendly', 'professional', 'mentor'].includes(initialSettings.tone)
      ? initialSettings.tone
      : 'balanced'
  );
  const [answerDepth, setAnswerDepth] = useState(
    ['concise', 'balanced', 'detailed'].includes(initialSettings.answerDepth)
      ? initialSettings.answerDepth
      : 'balanced'
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [messages, setMessages] = useState(() => [
    createGreetingMessage('there'),
  ]);

  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [processingStatus, setProcessingStatus] = useState('');
  const [activeAssistantId, setActiveAssistantId] = useState(null);
  const [assistantMode, setAssistantMode] = useState(ASSISTANT_MODES.RESEARCH);
  const [studyPapers, setStudyPapers] = useState([]);
  const [studyLoadingPapers, setStudyLoadingPapers] = useState(false);
  const [selectedStudyMaterialId, setSelectedStudyMaterialId] = useState('');
  const [studySessionId, setStudySessionId] = useState('');
  const [studyQuestion, setStudyQuestion] = useState(null);
  const [studyMessages, setStudyMessages] = useState([]);
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyReadyToSubmit, setStudyReadyToSubmit] = useState(false);
  const [studyResult, setStudyResult] = useState(null);
  const [showStudyDetails, setShowStudyDetails] = useState(false);
  const profileLoadedRef = useRef(false);

  const addStudyAssistantMessage = (text) => {
    setStudyMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-study-assistant`,
        role: 'assistant',
        text,
        time: nowTime(),
      },
    ]);
  };

  const addStudyUserMessage = (text) => {
    setStudyMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-study-user`,
        role: 'user',
        text,
        time: nowTime(),
      },
    ]);
  };

  const renderStudyQuestionText = (question) => {
    if (!question) return '';
    const optionsText = Array.isArray(question.options)
      ? question.options.map((opt) => `${opt.key}. ${opt.text}`).join('\n')
      : '';
    return `Question ${question.number}/${question.total}\n\n${question.text}${optionsText ? `\n\n${optionsText}` : ''}`;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [loading]);

  useEffect(() => {
    if (!isSettingsOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        storeConversation,
        showSources,
        responseLanguage,
        memoryTurns,
        strictHndMode,
        tone,
        answerDepth,
      })
    );
  }, [storeConversation, showSources, responseLanguage, memoryTurns, strictHndMode, tone, answerDepth]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('jwt_token') || localStorage.getItem('authToken');
        if (!token) {
          profileLoadedRef.current = true;
          return;
        }

        const response = await fetch(`${API_BASE_URL_NORMALIZED}/ai/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          profileLoadedRef.current = true;
          return;
        }

        const data = await response.json();
        const profile = data?.profile || {};
        if (cancelled || !profile || typeof profile !== 'object') {
          profileLoadedRef.current = true;
          return;
        }

        if (typeof profile.storeConversation === 'boolean') setStoreConversation(profile.storeConversation);
        if (typeof profile.showSources === 'boolean') setShowSources(profile.showSources);
        if (profile.responseLanguage === 'fr' || profile.responseLanguage === 'en') setResponseLanguage(profile.responseLanguage);
        if ([3, 4, 5, 6].includes(Number(profile.memoryTurns))) setMemoryTurns(Number(profile.memoryTurns));
        if (typeof profile.strictHndMode === 'boolean') setStrictHndMode(profile.strictHndMode);
        if (['balanced', 'friendly', 'professional', 'mentor'].includes(profile.tone)) setTone(profile.tone);
        if (['concise', 'balanced', 'detailed'].includes(profile.answerDepth)) setAnswerDepth(profile.answerDepth);
      } catch (_) {
        // Keep local defaults if profile loading fails.
      } finally {
        profileLoadedRef.current = true;
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profileLoadedRef.current) return undefined;

    const token = localStorage.getItem('jwt_token') || localStorage.getItem('authToken');
    if (!token) return undefined;

    const timer = setTimeout(() => {
      fetch(`${API_BASE_URL_NORMALIZED}/ai/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tone,
          answerDepth,
          responseLanguage,
          memoryTurns,
          strictHndMode,
          showSources,
          storeConversation,
        }),
      }).catch(() => {
        // Profile persistence is best-effort and must not block chat UX.
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [tone, answerDepth, responseLanguage, memoryTurns, strictHndMode, showSources, storeConversation]);

  useEffect(() => {
    if (hasHydratedSessionRef.current) return;

    if (!storeConversation) {
      setMessages([createGreetingMessage(userFirstName)]);
      hasHydratedSessionRef.current = true;
      return;
    }

    const parsed = safeParse(sessionStorage.getItem(sessionKey));
    if (Array.isArray(parsed) && parsed.length > 0) {
      setMessages(parsed);
    } else {
      setMessages([createGreetingMessage(userFirstName)]);
    }

    hasHydratedSessionRef.current = true;
  }, [sessionKey, storeConversation, userFirstName]);

  useEffect(() => {
    if (!hasHydratedSessionRef.current) return;
    if (!storeConversation) return;
    sessionStorage.setItem(sessionKey, JSON.stringify(messages.slice(-80)));
  }, [messages, storeConversation, sessionKey]);

  useEffect(() => {
    if (!loading) {
      setProcessingStatus('');
      return undefined;
    }

    const stageList = responseLanguage === 'fr' ? PROCESSING_STAGES.fr : PROCESSING_STAGES.en;
    let stageIndex = 0;
    setProcessingStatus(stageList[stageIndex]);

    const timer = setInterval(() => {
      stageIndex = (stageIndex + 1) % stageList.length;
      setProcessingStatus(stageList[stageIndex]);
    }, 1700);

    return () => clearInterval(timer);
  }, [loading, responseLanguage]);

  useEffect(() => {
    if (!isCandidateUser || assistantMode !== ASSISTANT_MODES.STUDY) return;
    let cancelled = false;

    const loadStudyPapers = async () => {
      try {
        setStudyLoadingPapers(true);
        const { data } = await api.get('/ai/study/papers');
        if (cancelled) return;
        const papers = Array.isArray(data?.papers) ? data.papers : [];
        setStudyPapers(papers);
        setSelectedStudyMaterialId((prev) =>
          papers.find((item) => String(item.materialId) === String(prev))
            ? prev
            : papers[0]?.materialId || ''
        );
      } catch (_) {
        if (!cancelled) {
          setStudyPapers([]);
          setSelectedStudyMaterialId('');
          addStudyAssistantMessage('Could not load study papers right now. Please try again.');
        }
      } finally {
        if (!cancelled) setStudyLoadingPapers(false);
      }
    };

    setStudyMessages([
      {
        id: 'study-greeting',
        role: 'assistant',
        text: 'Study Mode is ready. Select a question paper to begin a 20-question MCQ session.',
        time: nowTime(),
      },
    ]);

    loadStudyPapers();
    return () => {
      cancelled = true;
    };
  }, [assistantMode, isCandidateUser]);

  useEffect(() => {
    if (assistantMode !== ASSISTANT_MODES.STUDY) return;
    setStudySessionId('');
    setStudyQuestion(null);
    setStudyReadyToSubmit(false);
    setStudyResult(null);
    setShowStudyDetails(false);
  }, [assistantMode]);

  const addAssistantNotice = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-assistant-note`,
        role: 'assistant',
        text,
        sources: [],
        time: nowTime(),
      },
    ]);
  };

  const handleFilesSelected = async (event) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;

    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!remainingSlots) {
      addAssistantNotice(`You can attach up to ${MAX_ATTACHMENTS} files per prompt.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const toProcess = selected.slice(0, remainingSlots);
    const validAttachments = [];

    for (const file of toProcess) {
      if (!isTextLikeFile(file)) {
        addAssistantNotice(`Unsupported file type for ${file.name}. Please upload text-based files (txt, md, json, csv, xml).`);
        continue;
      }

      if (file.size > MAX_ATTACHMENT_SIZE) {
        addAssistantNotice(`${file.name} exceeds the ${Math.floor(MAX_ATTACHMENT_SIZE / (1024 * 1024))}MB limit.`);
        continue;
      }

      try {
        const content = await readFileAsText(file);
        const trimmed = content.trim();
        if (!trimmed) {
          addAssistantNotice(`${file.name} appears to be empty.`);
          continue;
        }

        validAttachments.push({
          id: `${Date.now()}-${file.name}`,
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          content: trimmed.slice(0, MAX_ATTACHMENT_TEXT),
          truncated: trimmed.length > MAX_ATTACHMENT_TEXT,
        });
      } catch (err) {
        addAssistantNotice(err.message || `Could not read ${file.name}.`);
      }
    }

    if (validAttachments.length) {
      setAttachments((prev) => [...prev, ...validAttachments].slice(0, MAX_ATTACHMENTS));
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    inputRef.current?.focus();
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((prev) => prev.filter((f) => f.id !== attachmentId));
    inputRef.current?.focus();
  };

  const handleStoreConversationToggle = (enabled) => {
    setStoreConversation(enabled);

    if (!enabled) {
      sessionStorage.removeItem(sessionKey);
      return;
    }

    const parsed = safeParse(sessionStorage.getItem(sessionKey));
    if (Array.isArray(parsed) && parsed.length > 0) {
      setMessages(parsed);
    } else {
      const freshGreeting = [createGreetingMessage(userFirstName)];
      setMessages(freshGreeting);
      sessionStorage.setItem(sessionKey, JSON.stringify(freshGreeting));
    }
  };

  const clearConversation = () => {
    const freshGreeting = [createGreetingMessage(userFirstName)];
    setMessages(freshGreeting);
    if (storeConversation) {
      sessionStorage.setItem(sessionKey, JSON.stringify(freshGreeting));
    }
    setAttachments([]);
    setInput('');
    setIsSettingsOpen(false);
    inputRef.current?.focus();
  };

  const streamMessage = async (question, filesSnapshot) => {
    const fallbackPrompt =
      responseLanguage === 'fr'
        ? 'Analyse les fichiers joints et donne un resume clair.'
        : 'Analyze the attached files and provide a concise summary.';

    const messageText = question || fallbackPrompt;

    const userMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text: messageText,
      time: nowTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    const assistantId = `${Date.now()}-assistant`;
    let fullText = '';

    const updateAssistantText = (text) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, text } : m))
      );
    };

    const updateAssistantSources = (sources) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
      );
    };

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        text: '',
        sources: [],
        time: nowTime(),
      },
    ]);
    setActiveAssistantId(assistantId);

    const historyMessages = messages
      .filter((m) => m.id !== 'greeting')
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => String(m.text || '').trim())
      .map((m) => ({ role: m.role, text: String(m.text || '').trim().slice(0, 1600) }));
    const memoryMessageLimit = Math.max(6, Math.min(12, Number(memoryTurns) * 2));
    const conversationHistory = historyMessages.slice(-memoryMessageLimit);

    let currentRoute = '/';
    try {
      currentRoute = window.location.pathname || '/';
    } catch (_) {
      currentRoute = '/';
    }

    try {
      const token = localStorage.getItem('jwt_token') || localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL_NORMALIZED}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageText,
          language: responseLanguage,
          includeSources: showSources,
          strictHndMode,
          profile: {
            tone,
            answerDepth,
            responseLanguage,
            memoryTurns,
            strictHndMode,
            showSources,
            storeConversation,
          },
          currentRoute,
          conversationHistory,
          attachments: filesSnapshot.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
            content: f.content,
            truncated: f.truncated,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let streamFinished = false;
      setIsStreaming(true);
      currentStreamRef.current = reader;

      while (!streamFinished) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              streamFinished = true;
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                const streamErrorMessage = String(parsed.error || '').trim() || 'Stream interrupted';
                updateAssistantText(streamErrorMessage);
                continue;
              }
              if (parsed.status) {
                const streamStatus = String(parsed.status || '').trim();
                if (streamStatus) setProcessingStatus(streamStatus);
              }
              if (parsed.text) {
                fullText += parsed.text;
                updateAssistantText(fullText);
              }
              if (Array.isArray(parsed.sources)) {
                updateAssistantSources(parsed.sources);
              }
            } catch (_) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      const errorText = `I encountered an error: ${error.message}. Please try again.`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: errorText } : m
        )
      );
    } finally {
      setLoading(false);
      setIsStreaming(false);
      setActiveAssistantId(null);
      setProcessingStatus('');
      currentStreamRef.current = null;
    }
  };

  const onSend = () => {
    if (assistantMode !== ASSISTANT_MODES.RESEARCH) return;
    const q = String(input || '').trim();
    if ((!q && attachments.length === 0) || loading) return;
    const filesSnapshot = [...attachments];
    streamMessage(q, filesSnapshot);
  };

  const startStudySession = async () => {
    if (!selectedStudyMaterialId || studyBusy) return;
    setStudyBusy(true);
    setStudyResult(null);
    setShowStudyDetails(false);
    try {
      const { data } = await api.post('/ai/study/session/start', { materialId: selectedStudyMaterialId });
      const sessionId = String(data?.session?.sessionId || '');
      const firstQuestion = data?.question || null;
      if (!sessionId || !firstQuestion) {
        throw new Error('Invalid study session payload');
      }
      setStudySessionId(sessionId);
      setStudyQuestion(firstQuestion);
      setStudyReadyToSubmit(false);
      setStudyMessages([
        {
          id: 'study-start',
          role: 'assistant',
          text: `Starting Study Mode for: ${data?.session?.paperTitle || 'Selected paper'}`,
          time: nowTime(),
        },
        {
          id: `${Date.now()}-study-q1`,
          role: 'assistant',
          text: renderStudyQuestionText(firstQuestion),
          time: nowTime(),
        },
      ]);
    } catch (error) {
      addStudyAssistantMessage(`Could not start study session: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setStudyBusy(false);
    }
  };

  const answerStudyQuestion = async (optionKey, optionText) => {
    if (!studySessionId || !studyQuestion || studyBusy || studyReadyToSubmit) return;
    addStudyUserMessage(`Answer: ${optionKey}. ${optionText}`);
    setStudyBusy(true);
    try {
      const { data } = await api.post('/ai/study/session/answer', {
        sessionId: studySessionId,
        selectedOption: optionKey,
      });

      if (data?.done) {
        setStudyReadyToSubmit(true);
        setStudyQuestion(null);
        addStudyAssistantMessage(data?.message || 'All 20 questions answered. Submit to get your result.');
        return;
      }

      const nextQuestion = data?.question || null;
      if (!nextQuestion) {
        throw new Error('No next question received');
      }
      setStudyQuestion(nextQuestion);
      addStudyAssistantMessage(renderStudyQuestionText(nextQuestion));
    } catch (error) {
      addStudyAssistantMessage(`Failed to submit answer: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setStudyBusy(false);
    }
  };

  const submitStudySession = async () => {
    if (!studySessionId || !studyReadyToSubmit || studyBusy) return;
    setStudyBusy(true);
    try {
      const { data } = await api.post('/ai/study/session/submit', { sessionId: studySessionId });
      const result = data?.result || null;
      if (!result) throw new Error('No result returned');
      setStudyResult(result);
      setShowStudyDetails(false);
      addStudyAssistantMessage(
        `Result: ${result.correct}/${result.total} (${result.percentage}%) • Grade ${result.grade}\n${result.summary}`
      );
    } catch (error) {
      addStudyAssistantMessage(`Failed to submit study session: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setStudyBusy(false);
    }
  };

  if (loading && messages.length === 1) {
    return <GraduationCapLoader fullscreen label="AI assistant is starting up..." />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.title}>AI Assistant</div>
            <div className={styles.subtitle}>
              Powered by GPT-4 - Ask me anything about the Acadex
            </div>
          </div>

          <div className={styles.settingsWrap} ref={settingsMenuRef}>
            <button
              type="button"
              className={styles.settingsBtn}
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              title="AI settings"
              aria-label="AI settings"
            >
              ...
            </button>

            {isSettingsOpen ? (
              <div className={styles.settingsPopover}>
                <div className={styles.settingsTitle}>Assistant Settings</div>
                <div className={styles.settingsStatusLine}>Storage: {storeConversation ? 'On' : 'Off'}</div>
                <div className={styles.settingsStatusLine}>Model response mode: Streaming + auto fallback</div>
                <div className={styles.settingsStatusLine}>Memory window: Last {memoryTurns} turns</div>
                <div className={styles.settingsStatusLine}>Tone: {tone} | Depth: {answerDepth}</div>

                <label className={styles.settingRow} htmlFor="store-conversation-toggle">
                  <span>Store conversation in this session</span>
                  <input
                    id="store-conversation-toggle"
                    type="checkbox"
                    checked={storeConversation}
                    onChange={(e) => handleStoreConversationToggle(e.target.checked)}
                  />
                </label>

                <label className={styles.settingRow} htmlFor="show-sources-toggle">
                  <span>Show web sources</span>
                  <input
                    id="show-sources-toggle"
                    type="checkbox"
                    checked={showSources}
                    onChange={(e) => setShowSources(e.target.checked)}
                  />
                </label>

                <label className={styles.settingRow} htmlFor="strict-hnd-toggle">
                  <span>Strict HND knowledge-first mode</span>
                  <input
                    id="strict-hnd-toggle"
                    type="checkbox"
                    checked={strictHndMode}
                    onChange={(e) => setStrictHndMode(e.target.checked)}
                  />
                </label>

                <div className={styles.settingBlock}>
                  <label className={styles.settingLabel} htmlFor="menu-memory-turns-select">
                    Conversation memory sent to backend
                  </label>
                  <select
                    id="menu-memory-turns-select"
                    className={styles.settingSelect}
                    value={String(memoryTurns)}
                    onChange={(e) => setMemoryTurns(Number(e.target.value))}
                    disabled={loading}
                  >
                    <option value="3">Last 3 turns</option>
                    <option value="4">Last 4 turns</option>
                    <option value="5">Last 5 turns</option>
                    <option value="6">Last 6 turns</option>
                  </select>
                </div>

                <div className={styles.settingBlock}>
                  <label className={styles.settingLabel} htmlFor="menu-ai-tone-select">
                    Assistant tone
                  </label>
                  <select
                    id="menu-ai-tone-select"
                    className={styles.settingSelect}
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    disabled={loading}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="mentor">Mentor</option>
                  </select>
                </div>

                <div className={styles.settingBlock}>
                  <label className={styles.settingLabel} htmlFor="menu-ai-depth-select">
                    Answer depth
                  </label>
                  <select
                    id="menu-ai-depth-select"
                    className={styles.settingSelect}
                    value={answerDepth}
                    onChange={(e) => setAnswerDepth(e.target.value)}
                    disabled={loading}
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>

                <div className={styles.settingBlock}>
                  <label className={styles.settingLabel} htmlFor="menu-ai-language-select">
                    Response language
                  </label>
                  <select
                    id="menu-ai-language-select"
                    className={styles.settingSelect}
                    value={responseLanguage}
                    onChange={(e) => setResponseLanguage(e.target.value)}
                    disabled={loading}
                  >
                    <option value="en">English</option>
                    <option value="fr">French</option>
                  </select>
                </div>

                <button
                  type="button"
                  className={styles.clearConversationBtn}
                  onClick={clearConversation}
                  disabled={loading || isStreaming}
                >
                  Clear conversation
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {isCandidateUser ? (
          <div className={styles.modeRow}>
            <label className={styles.modeLabel} htmlFor="assistant-mode-select">Mode</label>
            <select
              id="assistant-mode-select"
              className={styles.modeSelect}
              value={assistantMode}
              onChange={(e) => setAssistantMode(e.target.value)}
              disabled={loading || studyBusy}
            >
              <option value={ASSISTANT_MODES.RESEARCH}>Research Mode</option>
              <option value={ASSISTANT_MODES.STUDY}>Study Mode</option>
            </select>
          </div>
        ) : null}

        {isCandidateUser && assistantMode === ASSISTANT_MODES.STUDY && !studySessionId ? (
          <div className={styles.studySetupCard}>
            <label className={styles.settingLabel} htmlFor="study-paper-select">Select question paper</label>
            <select
              id="study-paper-select"
              className={styles.settingSelect}
              value={selectedStudyMaterialId}
              onChange={(e) => setSelectedStudyMaterialId(e.target.value)}
              disabled={studyLoadingPapers || studyBusy}
            >
              <option value="">Select paper</option>
              {studyPapers.map((paper) => (
                <option key={paper.materialId} value={paper.materialId}>
                  {paper.paperTitle} ({paper.questionCount} questions)
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.studyStartBtn}
              onClick={startStudySession}
              disabled={!selectedStudyMaterialId || studyLoadingPapers || studyBusy}
            >
              {studyLoadingPapers ? 'Loading papers...' : 'Start Study Session'}
            </button>
          </div>
        ) : null}

        <div className={styles.messages}>
          {(assistantMode === ASSISTANT_MODES.STUDY ? studyMessages : messages).map((m) => (
            <div key={m.id} className={`${styles.row} ${m.role === 'user' ? styles.rowUser : ''}`}>
              <div
                className={`${styles.bubble} ${
                  m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant
                }`}
              >
                <div className={styles.meta}>
                  {m.role === 'user' ? 'You' : 'Assistant'} - {m.time}
                </div>
                {m.text ? m.text : null}
                {!m.text && m.role === 'assistant' && loading && m.id === activeAssistantId ? (
                  <span className={styles.processingGhost}>{processingStatus || 'Working on it...'}</span>
                ) : null}
                {showSources && m.role === 'assistant' && Array.isArray(m.sources) && m.sources.length > 0 ? (
                  <div className={styles.sources}>
                    <div className={styles.sourcesTitle}>Sources</div>
                    <div className={styles.sourcesList}>
                      {m.sources.slice(0, 3).map((s) => {
                        const href = s.link || s.url;
                        if (!href) return null;
                        return (
                          <a
                            key={href}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.sourceLink}
                          >
                            {s.title || href}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {assistantMode === ASSISTANT_MODES.RESEARCH ? (
        <div className={styles.composerWrap}>
          <div className={styles.attachmentControls}>
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || attachments.length >= MAX_ATTACHMENTS}
            >
              Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className={styles.hiddenFileInput}
              onChange={handleFilesSelected}
              accept=".txt,.md,.markdown,.json,.csv,.log,.xml,.yml,.yaml,text/plain,text/markdown,application/json,text/csv,application/xml,text/xml"
            />
            <span className={styles.attachHint}>Text files only, max {MAX_ATTACHMENTS} files, 2MB each</span>
          </div>

          {attachments.length > 0 ? (
            <div className={styles.attachmentList}>
              {attachments.map((file) => (
                <div key={file.id} className={styles.attachmentItem}>
                  <span className={styles.attachmentName}>{file.name}</span>
                  <button
                    type="button"
                    className={styles.removeAttachmentBtn}
                    onClick={() => removeAttachment(file.id)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.composer}>
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Ask me anything..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={loading}
              className={styles.input}
            />
            <button
              onClick={onSend}
              disabled={loading || (!input.trim() && attachments.length === 0)}
              className={styles.sendBtn}
              title="Send message"
            >
              <FaPaperPlane size={18} />
            </button>
          </div>
        </div>
        ) : (
        <div className={styles.composerWrap}>
          {studyQuestion && !studyReadyToSubmit ? (
            <div className={styles.studyOptionsWrap}>
              {studyQuestion.options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={styles.studyOptionBtn}
                  onClick={() => answerStudyQuestion(option.key, option.text)}
                  disabled={studyBusy}
                >
                  {option.key}. {option.text}
                </button>
              ))}
            </div>
          ) : null}

          {studyReadyToSubmit ? (
            <button
              type="button"
              className={styles.studySubmitBtn}
              onClick={submitStudySession}
              disabled={studyBusy}
            >
              Submit For AI Marking
            </button>
          ) : null}

          {studyResult ? (
            <div className={styles.studyResultCard}>
              <div><strong>Score:</strong> {studyResult.correct}/{studyResult.total} ({studyResult.percentage}%)</div>
              <div><strong>Grade:</strong> {studyResult.grade}</div>
              <div>{studyResult.summary}</div>

              {Array.isArray(studyResult.review) && studyResult.review.length > 0 ? (
                <>
                  <button
                    type="button"
                    className={styles.studyDetailsToggleBtn}
                    onClick={() => setShowStudyDetails((prev) => !prev)}
                  >
                    {showStudyDetails ? 'Hide Full Detailed Correction' : 'View Full Detailed Correction'}
                  </button>

                  {showStudyDetails ? (
                    <div className={styles.studyDetailsList}>
                      {studyResult.review.map((item) => (
                        <article key={item.number} className={styles.studyDetailItem}>
                          <div className={styles.studyDetailTopRow}>
                            <strong>Q{item.number}.</strong>
                            <span className={item.isCorrect ? styles.studyBadgeCorrect : styles.studyBadgeWrong}>
                              {item.isCorrect ? 'Correct' : 'Wrong'}
                            </span>
                          </div>
                          <div className={styles.studyDetailQuestion}>{item.question}</div>
                          <div><strong>Your Answer:</strong> {item.selectedOption || 'No answer'}</div>
                          {!item.isCorrect ? (
                            <div><strong>Correct Answer:</strong> {item.correctOption}{item.correctAnswer ? ` - ${item.correctAnswer}` : ''}</div>
                          ) : null}
                          <div><strong>Reason:</strong> {item.reason || 'No reason provided.'}</div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant;

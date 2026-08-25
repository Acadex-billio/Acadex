import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowLeft, FaCheck, FaCheckDouble, FaEllipsisV, FaPaperPlane, FaPaperclip, FaRegSmile, FaSearch, FaTimes, FaTrash, FaSmile, FaCheckSquare, FaSquare } from 'react-icons/fa';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/groupchat.module.css';
import PaymentActionModal from './PaymentActionModal';
import { maskCandidateId } from '../utility/maskCandidateId';

const roomLabel = (room, selfCandId) => {
  if (!room) return '';
  if (room.type !== 'dm') return room.name;
  const otherName = room.dm_other_name;
  if (otherName) return `Personal • ${otherName}`;
  const key = String(room.dm_key || '');
  if (!key.includes('|')) return 'Personal Chat';
  const [a, b] = key.split('|');
  const other = a === selfCandId ? b : b === selfCandId ? a : '';
  return other ? `Personal • ${maskCandidateId(other)}` : 'Personal Chat';
};

const badgeText = (n) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num) || num <= 0) return '';
  if (num > 99) return '99+';
  return String(num);
};

const isImageAttachment = (message) => {
  const mime = String(message?.attachment_mime || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ref = `${String(message?.attachment_name || '')} ${String(message?.attachment_url || '')}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(ref);
};

const GroupChat = ({ mode = 'candidate' }) => {
  const messagesEndRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const toastRef = useRef({ boot: false, messages: false });
  const stoppedRef = useRef(false);
  const emojiWrapRef = useRef(null);
  const messageRefs = useRef(new Map());
  const attachmentObjectUrlsRef = useRef({});
  const loadingAttachmentIdsRef = useRef({});
  const failedAttachmentIdsRef = useRef({});

  const [self, setSelf] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMore, setShowMore] = useState(false);

  const [showCreateCenter, setShowCreateCenter] = useState(false);

  const [createCenterName, setCreateCenterName] = useState('');
  const [createCenterDescription, setCreateCenterDescription] = useState('');

  const [memberSearch, setMemberSearch] = useState('');
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [searchingInviteUsers, setSearchingInviteUsers] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [attachmentObjectUrls, setAttachmentObjectUrls] = useState({});
  const [attachmentThumbUrls, setAttachmentThumbUrls] = useState({});
  const [loadingAttachmentIds, setLoadingAttachmentIds] = useState({});
  const [failedAttachmentIds, setFailedAttachmentIds] = useState({});
  const [loadedAttachmentIds, setLoadedAttachmentIds] = useState({});
  const [expandedImageUrl, setExpandedImageUrl] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 980);
  const [mobileSection, setMobileSection] = useState('chats');
  const [mobilePanel, setMobilePanel] = useState('list');

  useEffect(() => {
    attachmentObjectUrlsRef.current = attachmentObjectUrls;
  }, [attachmentObjectUrls]);

  useEffect(() => {
    loadingAttachmentIdsRef.current = loadingAttachmentIds;
  }, [loadingAttachmentIds]);

  useEffect(() => {
    failedAttachmentIdsRef.current = failedAttachmentIds;
  }, [failedAttachmentIds]);

  const activeRoom = useMemo(() => rooms.find((r) => String(r.room_id) === String(activeRoomId)) || null, [rooms, activeRoomId]);
  const selfCandId = String(self?.cand_id || '');
  const isAdminSelf = useMemo(() => {
    const role = String(self?.role || '').toLowerCase();
    return Boolean(self?.is_admin) || role === 'admin' || role === 'developer';
  }, [self]);
  const adminMode = mode === 'admin' || isAdminSelf;
  const showGroupSections = adminMode || !isMobileView || mobileSection === 'groups';
  const showPersonalSection = !adminMode && (!isMobileView || mobileSection === 'chats');
  const showChatListPanel = !isMobileView || mobilePanel === 'list';
  const showChatRoomPanel = !isMobileView || mobilePanel === 'chat';
  const filteredMessages = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => String(m.text || '').toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const canType = useMemo(() => {
    if (!activeRoom) return true;
    if (activeRoom.type !== 'dm') return true;
    return !activeRoom.dm_blocked_me;
  }, [activeRoom]);

  useEffect(() => {
    // Removed axios defaults - using api service instead
  }, []);

  useEffect(() => {
    const onResize = () => {
      const nextIsMobile = window.innerWidth <= 980;
      setIsMobileView(nextIsMobile);
      if (!nextIsMobile) setMobilePanel('chat');
      if (nextIsMobile && mobilePanel !== 'list' && !activeRoomId) setMobilePanel('list');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mobilePanel, activeRoomId]);

  useEffect(() => {
    if (!isMobileView || mobilePanel !== 'list') return;
    setShowMore(false);
    setShowSearch(false);
  }, [isMobileView, mobilePanel]);

  useEffect(() => {
    if (!showEmoji) return;
    const onDocDown = (e) => {
      const el = emojiWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [showEmoji]);

  const refreshInvites = useCallback(async () => {
    if (adminMode) {
      setPendingInvites([]);
      return;
    }
    try {
      const { data } = await api.get('/chat/invites');
      setPendingInvites(Array.isArray(data?.invites) ? data.invites : []);
    } catch (err) {
      setPendingInvites([]);
    }
  }, [adminMode]);

  const refreshRooms = useCallback(async () => {
    const { data } = await api.get('/chat/rooms');
    const rs = Array.isArray(data?.rooms) ? data.rooms : [];
    setRooms(rs);
    return rs;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await api.post('/chat/bootstrap');
        if (!mounted) return;
        await refreshRooms();
        await refreshInvites();
      } catch (err) {
        showToast(getErrorMessage(err, 'Failed to init chat'), 'error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshRooms, refreshInvites]);

  useEffect(() => {
    let cancelled = false;
    const loadSelfAndRooms = async () => {
      try {
        stoppedRef.current = false;
        const { data: me } = await api.get('/auth/me');
        if (cancelled) return;
        if (!me?.authenticated || !me?.user?.cand_id) {
          setSelf(null);
          setRooms([]);
          setActiveRoomId('');
          setMessages([]);
          return;
        }
        setSelf(me.user);

        await api.post('/chat/bootstrap');
        const { data: list } = await api.get('/chat/rooms');
        if (cancelled) return;
        const rs = Array.isArray(list?.rooms) ? list.rooms : [];
        setRooms(rs);

        const general = rs.find((x) => x.type === 'general');
        if (general) setActiveRoomId(String(general.room_id));
        else if (rs[0]) setActiveRoomId(String(rs[0].room_id));
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) {
          stoppedRef.current = true;
          if (!cancelled) {
            setSelf(null);
            setRooms([]);
            setActiveRoomId('');
            setMessages([]);
          }
          return;
        }

        if (status === 429) return;
        if (!cancelled && !toastRef.current.boot) {
          toastRef.current.boot = true;
          showToast(getErrorMessage(err, 'Unable to load chat'), 'error');
          setTimeout(() => {
            toastRef.current.boot = false;
          }, 4000);
        }
      }
    };
    loadSelfAndRooms();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeRoomId) return;
    if (!selfCandId) return;
    if (stoppedRef.current) return;
    let cancelled = false;
    const loadMessages = async () => {
      try {
        const { data } = await api.get(`/chat/rooms/${encodeURIComponent(activeRoomId)}/messages?limit=120`);
        if (!cancelled) setMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) {
          stoppedRef.current = true;
          if (!cancelled) {
            setSelf(null);
            setRooms([]);
            setActiveRoomId('');
            setMessages([]);
          }
          return;
        }
        if (status === 429) return;
        if (!cancelled && !toastRef.current.messages) {
          toastRef.current.messages = true;
          showToast(getErrorMessage(err, 'Failed to load messages'), 'error');
          setTimeout(() => {
            toastRef.current.messages = false;
          }, 4000);
        }
      }
    };

    loadMessages();
    const timer = setInterval(loadMessages, 4500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeRoomId, selfCandId]);

  useEffect(() => {
    // Clear and revoke preview blobs when switching rooms.
    setAttachmentObjectUrls((prev) => {
      Object.values(prev).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
          // ignore
        }
      });
      return {};
    });
    setAttachmentThumbUrls((prev) => {
      Object.values(prev).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
          // ignore
        }
      });
      return {};
    });
    setLoadingAttachmentIds({});
    setFailedAttachmentIds({});
    setLoadedAttachmentIds({});
  }, [activeRoomId]);

  useEffect(() => {
    let cancelled = false;

    const buildThumb = (blob) =>
      new Promise((resolve) => {
        try {
          const src = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const maxSide = 32;
              const ratio = Math.max(img.width, img.height) / maxSide || 1;
              canvas.width = Math.max(1, Math.round(img.width / ratio));
              canvas.height = Math.max(1, Math.round(img.height / ratio));
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                URL.revokeObjectURL(src);
                return resolve(null);
              }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((thumbBlob) => {
                URL.revokeObjectURL(src);
                if (!thumbBlob) return resolve(null);
                resolve(URL.createObjectURL(thumbBlob));
              }, 'image/jpeg', 0.65);
            } catch (_) {
              URL.revokeObjectURL(src);
              resolve(null);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(src);
            resolve(null);
          };
          img.src = src;
        } catch (_) {
          resolve(null);
        }
      });

    const loadAttachmentImages = async () => {
      const targets = messages.filter((m) => {
        if (!m?._id || !m?.attachment_url) return false;
        if (!isImageAttachment(m)) return false;
        const id = String(m._id);
        if (
          attachmentObjectUrlsRef.current[id] ||
          loadingAttachmentIdsRef.current[id] ||
          failedAttachmentIdsRef.current[id]
        ) {
          return false;
        }
        return true;
      });

      for (const m of targets) {
        const id = String(m._id);
        try {
          setLoadingAttachmentIds((prev) => ({ ...prev, [id]: true }));
          const { data } = await api.get(
            `/chat/rooms/${encodeURIComponent(activeRoomId)}/messages/${encodeURIComponent(id)}/attachment`,
            { responseType: 'blob', timeout: 45000 }
          );

          if (cancelled) return;

          const blob = data instanceof Blob
            ? new Blob([data], { type: data.type || m.attachment_mime || 'image/png' })
            : new Blob([data], { type: m.attachment_mime || 'image/png' });
          const thumb = await buildThumb(blob);
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          setAttachmentObjectUrls((prev) => ({ ...prev, [id]: objectUrl }));
          if (thumb) {
            setAttachmentThumbUrls((prev) => ({ ...prev, [id]: thumb }));
          }
          setFailedAttachmentIds((prev) => ({ ...prev, [id]: false }));
        } catch (_) {
          if (!cancelled) setFailedAttachmentIds((prev) => ({ ...prev, [id]: true }));
        } finally {
          if (!cancelled) {
            setLoadingAttachmentIds((prev) => ({ ...prev, [id]: false }));
          }
        }
      }
    };

    if (activeRoomId && messages.length) loadAttachmentImages();

    return () => {
      cancelled = true;
    };
  }, [activeRoomId, messages]);

  useEffect(() => {
    return () => {
      Object.values(attachmentObjectUrls).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
          // ignore
        }
      });
      Object.values(attachmentThumbUrls).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
          // ignore
        }
      });
    };
  }, [attachmentObjectUrls, attachmentThumbUrls]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (!selfCandId) return;
    let cancelled = false;
    const mark = async () => {
      try {
        await api.post(`/chat/rooms/${encodeURIComponent(activeRoomId)}/read`);
        if (!cancelled) {
          setRooms((rs) => rs.map((r) => (String(r.room_id) === String(activeRoomId) ? { ...r, unread_count: 0 } : r)));
        }
      } catch (_) {
        // ignore
      }
    };
    mark();
    return () => {
      cancelled = true;
    };
  }, [activeRoomId, selfCandId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeRoomId]);

  useEffect(() => {
    setReplyingTo(null);
    setHighlightedMessageId('');
  }, [activeRoomId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (!invite) return;
    const join = async (paymentTransactionId = '') => {
      try {
        const { data } = await api.post(`/chat/invite/${encodeURIComponent(invite)}/join`, paymentTransactionId ? { paymentTransactionId } : {});
        await refreshRooms();
        if (data?.room_id) setActiveRoomId(String(data.room_id));
        showToast('Joined center chat', 'success');
      } catch (err) {
        if (err?.response?.status === 402 && err?.response?.data?.payment_requirement) {
          const requirement = err.response.data.payment_requirement;
          setPaymentRequest({
            title: requirement.title,
            description: requirement.message,
            amount: requirement.amount,
            currency: requirement.currency,
            onStartPayment: async ({ phoneNumber, paymentMethod = 'momo', promoCode = '' }) => {
              const { data } = await api.post('/candidate/payments/centers/checkout', {
                action: 'join',
                roomId: requirement.resource_id,
                paymentMethod,
                phoneNumber,
                promoCode,
                referralCode: promoCode,
              });
              return data;
            },
            onSuccess: async (result) => {
              const transactionId = result?.payment?.transaction_id;
              if (transactionId) await join(transactionId);
            },
          });
          return;
        }
        showToast(getErrorMessage(err, 'Failed to join center chat'), 'error');
      }
    };
    join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRooms]);

  useEffect(() => {
    const match = input.match(/(^|\s)@([a-zA-Z0-9_.-]*)$/);
    const nextQuery = match?.[2] || '';
    setMentionQuery(nextQuery);

    if (!nextQuery) {
      setMentionResults([]);
      return;
    }

    const q = nextQuery.trim().toLowerCase();
    const filtered = members.filter((member) => {
      const label = `${member.name || ''} ${member.cand_id || ''}`.toLowerCase();
      return label.includes(q);
    }).slice(0, 6);
    setMentionResults(filtered);
  }, [input, members]);

  const onSelectMention = (member) => {
    const nextValue = input.replace(/(^|\s)@([a-zA-Z0-9_.-]*)$/, `$1@${member.name || member.cand_id} `);
    setInput(nextValue);
    setSelectedMentions((prev) => (prev.includes(member.cand_id) ? prev : [...prev, member.cand_id]));
    setMentionQuery('');
    setMentionResults([]);
  };

  const onSend = async () => {
    if (!activeRoomId) return;
    if (!canType) return;
    const text = input.trim();
    if (!text && !selectedAttachment) return;
    setInput('');
    const pendingAttachment = selectedAttachment;
    const pendingReply = replyingTo;
    const pendingMentions = selectedMentions;
    setSelectedAttachment(null);
    setReplyingTo(null);
    setSelectedMentions([]);
    setMentionQuery('');
    setMentionResults([]);
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const optimisticMessage = {
      _id: optimisticId,
      room_id: activeRoomId,
      sender_cand_id: selfCandId,
      sender_name: self?.name || selfCandId,
      text,
      attachment_url: null,
      attachment_name: pendingAttachment?.name || null,
      attachment_mime: pendingAttachment?.type || null,
      attachment_size: pendingAttachment?.size || null,
      reply_to_message_id: pendingReply?._id || null,
      reply_to: pendingReply
        ? {
            _id: pendingReply._id,
            sender_cand_id: pendingReply.sender_cand_id,
            sender_name: pendingReply.sender_name,
            text: pendingReply.text || '',
            attachment_name: pendingReply.attachment_name || null,
          }
        : null,
      reactions: [],
      status: { state: 'sending', delivered_count: 0, read_count: 0, total_recipients: 0 },
      createdAt: new Date().toISOString(),
    };

    setMessages((ms) => [...ms, optimisticMessage]);

    try {
      const payload = new FormData();
      if (text) payload.append('text', text);
      if (pendingAttachment) payload.append('attachment', pendingAttachment);
      if (pendingReply?._id) payload.append('reply_to_message_id', String(pendingReply._id));
      if (pendingMentions.length) payload.append('mentions', JSON.stringify(pendingMentions));

      const { data: sent } = await api.post(`/chat/rooms/${encodeURIComponent(activeRoomId)}/messages`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (sent?.blocked && sent?.auto_message) {
        setMessages((ms) => [...ms.filter((m) => String(m._id) !== optimisticId), sent.auto_message]);
        await refreshRooms();
        return;
      }

      if (sent?.message?._id) {
        setMessages((ms) =>
          ms.map((m) =>
            String(m._id) === optimisticId
              ? {
                  ...sent.message,
                  reply_to: pendingReply
                    ? {
                        _id: pendingReply._id,
                        sender_cand_id: pendingReply.sender_cand_id,
                        sender_name: pendingReply.sender_name,
                        text: pendingReply.text || '',
                        attachment_name: pendingReply.attachment_name || null,
                      }
                    : null,
                  reactions: [],
                  status: { state: 'sent', delivered_count: 0, read_count: 0, total_recipients: 0 },
                }
              : m
          )
        );

        void api
          .get(`/chat/rooms/${encodeURIComponent(activeRoomId)}/messages?limit=120`)
          .then(({ data }) => {
            setMessages(Array.isArray(data?.messages) ? data.messages : []);
          })
          .catch(() => {
            // polling loop will recover message status
          });
      } else {
        setMessages((ms) => ms.filter((m) => String(m._id) !== optimisticId));
        const { data } = await api.get(`/chat/rooms/${encodeURIComponent(activeRoomId)}/messages?limit=120`);
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      }

      await refreshRooms();
    } catch (err) {
      setMessages((ms) => ms.filter((m) => String(m._id) !== optimisticId));
      if (pendingAttachment) setSelectedAttachment(pendingAttachment);
      if (pendingReply) setReplyingTo(pendingReply);
      setSelectedMentions(pendingMentions);
      setInput(text);
      showToast(getErrorMessage(err, 'Failed to send message'), 'error');
    }
  };

  const onToggleMute = async (room) => {
    try {
      const next = !room.muted;
      await api.put(`/chat/rooms/${encodeURIComponent(room.room_id)}/mute`, { muted: next });
      setRooms((rs) => rs.map((r) => (String(r.room_id) === String(room.room_id) ? { ...r, muted: next } : r)));
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update mute'), 'error');
    }
  };

  const onLeave = async (room) => {
    try {
      await api.post(`/chat/rooms/${encodeURIComponent(room.room_id)}/leave`);
      const rs = await refreshRooms();
      if (String(activeRoomId) === String(room.room_id)) {
        const fallback = rs.find((x) => x.type === 'general') || rs[0];
        setActiveRoomId(fallback ? String(fallback.room_id) : '');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to leave chat'), 'error');
    }
  };

  const onCreateCenter = async (paymentTransactionId = '') => {
    const name = createCenterName.trim();
    const description = createCenterDescription.trim();
    if (!name) return;
    if (!description) return;
    try {
      const payload = paymentTransactionId ? { name, description, paymentTransactionId } : { name, description };
      const { data } = await api.post('/chat/centers', payload);
      setCreateCenterName('');
      setCreateCenterDescription('');
      const rs = await refreshRooms();
      const roomId = data?.room?.room_id;
      if (roomId) setActiveRoomId(String(roomId));
      const invite = data?.room?.invite_code;
      if (invite) {
        const link = `${window.location.origin}/candidate/chat?invite=${invite}`;
        await navigator.clipboard.writeText(link);
        showToast('Center created. Invite link copied.', 'success');
      } else {
        showToast('Center created', 'success');
      }
      setShowCreateCenter(false);
      if (!roomId && rs[0]) setActiveRoomId(String(rs[0].room_id));
    } catch (err) {
      if (err?.response?.status === 402 && err?.response?.data?.payment_requirement) {
        const requirement = err.response.data.payment_requirement;
        setPaymentRequest({
          title: requirement.title,
          description: requirement.message,
          amount: requirement.amount,
          currency: requirement.currency,
          onStartPayment: async ({ phoneNumber, paymentMethod = 'momo', promoCode = '' }) => {
            const { data } = await api.post('/candidate/payments/centers/checkout', {
              action: 'create',
              paymentMethod,
              phoneNumber,
              promoCode,
              referralCode: promoCode,
            });
            return data;
          },
          onSuccess: async (result) => {
            const transactionId = result?.payment?.transaction_id;
            if (transactionId) await onCreateCenter(transactionId);
          },
        });
        return;
      }
      if (err?.response?.status === 403 && err?.response?.data?.code === 'PLAN_UPGRADE_REQUIRED') {
        showToast(err.response.data.message || 'Upgrade your subscription to continue.', 'warning');
        window.location.assign('/candidate/subscription');
        return;
      }
      showToast(getErrorMessage(err, 'Failed to create center'), 'error');
    }
  };

  const loadMembers = useCallback(
    async (roomId, q = '') => {
      if (!roomId) return;
      setLoadingMembers(true);
      try {
        const { data } = await api.get(`/chat/rooms/${encodeURIComponent(roomId)}/members?q=${encodeURIComponent(q)}`);
        setMembers(Array.isArray(data?.members) ? data.members : []);
      } catch (err) {
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!showMore || !activeRoomId) return;
    setMemberSearch('');
    loadMembers(activeRoomId, '');
  }, [showMore, activeRoomId, loadMembers]);

  useEffect(() => {
    if (!showMore || !activeRoomId) return;
    const t = setTimeout(() => {
      loadMembers(activeRoomId, memberSearch.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [memberSearch, showMore, activeRoomId, loadMembers]);

  const onToggleBlock = async () => {
    if (!activeRoom || activeRoom.type !== 'dm') return;
    const other = String(activeRoom.dm_other_cand_id || '').trim();
    if (!other) return;
    try {
      const next = !Boolean(activeRoom.dm_blocked_by_me);
      await api.put(`/chat/dm/${encodeURIComponent(other)}/block`, { blocked: next });
      await refreshRooms();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update block'), 'error');
    }
  };

  const onRespondInvite = async (inviteId, action, paymentTransactionId = '') => {
    try {
      await api.post(`/chat/invites/${encodeURIComponent(inviteId)}/respond`, paymentTransactionId ? { action, paymentTransactionId } : { action });
      await refreshInvites();
      await refreshRooms();
      showToast(action === 'accept' ? 'Invite accepted' : 'Invite rejected', 'success');
    } catch (err) {
      if (err?.response?.status === 402 && err?.response?.data?.payment_requirement) {
        const requirement = err.response.data.payment_requirement;
        setPaymentRequest({
          title: requirement.title,
          description: requirement.message,
          amount: requirement.amount,
          currency: requirement.currency,
          onStartPayment: async ({ phoneNumber, paymentMethod = 'momo', promoCode = '' }) => {
            const { data } = await api.post('/candidate/payments/centers/checkout', {
              action: 'join',
              roomId: requirement.resource_id,
              paymentMethod,
              phoneNumber,
              promoCode,
              referralCode: promoCode,
            });
            return data;
          },
          onSuccess: async (result) => {
            const transactionId = result?.payment?.transaction_id;
            if (transactionId) await onRespondInvite(inviteId, action, transactionId);
          },
        });
        return;
      }
      if (err?.response?.status === 403 && err?.response?.data?.code === 'PLAN_UPGRADE_REQUIRED') {
        showToast(err.response.data.message || 'Upgrade your subscription to continue.', 'warning');
        window.location.assign('/candidate/subscription');
        return;
      }
      showToast(getErrorMessage(err, 'Failed to respond to invite'), 'error');
    }
  };

  useEffect(() => {
    if (!inviteSearch.trim()) {
      setInviteResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingInviteUsers(true);
      try {
        const { data } = await api.get(`/chat/users/search?q=${encodeURIComponent(inviteSearch.trim())}`);
        if (!cancelled) setInviteResults(Array.isArray(data?.users) ? data.users : []);
      } catch (err) {
        if (!cancelled) setInviteResults([]);
      } finally {
        if (!cancelled) setSearchingInviteUsers(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inviteSearch]);

  const onSendCenterInvite = async (toCandId) => {
    if (!activeRoom || activeRoom.type !== 'center') return;
    try {
      await api.post(`/chat/rooms/${encodeURIComponent(activeRoom.room_id)}/invites`, { to_cand_id: toCandId });
      setInviteSearch('');
      setInviteResults([]);
      showToast('Invite sent', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to send invite'), 'error');
    }
  };

  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const { data } = await api.get(`/chat/users/search?q=${encodeURIComponent(userSearch.trim())}`);
        if (!cancelled) setUserResults(Array.isArray(data?.users) ? data.users : []);
      } catch (err) {
        if (!cancelled) setUserResults([]);
      } finally {
        if (!cancelled) setSearchingUsers(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [userSearch]);

  const onStartDm = async (otherCandId) => {
    if (adminMode) return;
    try {
      const { data } = await api.post(`/chat/dm/${encodeURIComponent(otherCandId)}`);
      await refreshRooms();
      if (data?.room_id) {
        setActiveRoomId(String(data.room_id));
        if (isMobileView) {
          setMobileSection('chats');
          setMobilePanel('chat');
        }
      }
      setUserSearch('');
      setUserResults([]);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to start personal chat'), 'error');
    }
  };

  const grouped = useMemo(() => {
    const general = rooms.filter((r) => r.type === 'general');
    const admin = rooms.filter((r) => r.type === 'admin');
    const dept = rooms.filter((r) => r.type === 'department');
    const dm = rooms.filter((r) => r.type === 'dm');
    const center = rooms.filter((r) => r.type === 'center');
    return { general, admin, dept, dm, center };
  }, [rooms]);

  const jumpToMessage = useCallback((messageId) => {
    if (!messageId) return;
    const node = messageRefs.current.get(String(messageId));
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(String(messageId));
    window.setTimeout(() => setHighlightedMessageId(''), 1800);
  }, []);

  const onAddReaction = async (messageId, emoji) => {
    try {
      const { data } = await api.post(
        `/chat/rooms/${encodeURIComponent(activeRoomId)}/messages/${encodeURIComponent(messageId)}/reactions`,
        { emoji }
      );
      if (data?.success) {
        setMessages((prev) =>
          prev.map((m) => (String(m._id) === String(messageId) ? { ...m, reactions: data.reactions } : m))
        );
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to add reaction'), 'error');
    }
    setShowReactionPicker(null);
  };

  const onDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/chat/rooms/${encodeURIComponent(activeRoomId)}/messages/${encodeURIComponent(messageId)}`);
      setMessages((prev) => prev.filter((m) => String(m._id) !== String(messageId)));
      setSelectedMessages((prev) => {
        const next = new Set(prev);
        next.delete(String(messageId));
        return next;
      });
      showToast('Message deleted', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete message'), 'error');
    }
  };

  const onToggleSelectMessage = (messageId) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      const id = String(messageId);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onDeleteSelectedMessages = async () => {
    if (!selectedMessages.size) return;
    if (!window.confirm(`Delete ${selectedMessages.size} message(s)?`)) return;
    let successCount = 0;
    for (const messageId of selectedMessages) {
      try {
        await api.delete(`/chat/rooms/${encodeURIComponent(activeRoomId)}/messages/${encodeURIComponent(messageId)}`);
        successCount += 1;
      } catch (_) {
        // continue
      }
    }
    if (successCount > 0) {
      setMessages((prev) =>
        prev.filter((m) => !selectedMessages.has(String(m._id)))
      );
      setSelectedMessages(new Set());
      showToast(`${successCount} message(s) deleted`, 'success');
    } else {
      showToast('Failed to delete messages', 'error');
    }
  };

  if (!self?.cand_id) {
    return (
      <div className={styles.chatPage}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Chat</div>
          <div className={styles.mutedText}>Please login to access chat.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatPage}>
      <div className={styles.layout}>
        {showChatListPanel && (
        <aside className={styles.sidebar}>
          <div className={styles.card}>
            <div className={styles.chatTitleRow}>
              <div className={styles.cardTitle} style={{ marginBottom: 0 }}>
                {adminMode ? 'All Admin Chat' : 'Chats'}
              </div>
              {!adminMode && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setShowCreateCenter(true)}
                  title="Create Center"
                  aria-label="Create Center"
                >
                  +
                </button>
              )}
            </div>

            {!adminMode && isMobileView && (
              <div className={styles.mobileTabs}>
                <button
                  type="button"
                  className={`${styles.mobileTabBtn} ${mobileSection === 'chats' ? styles.mobileTabBtnActive : ''}`}
                  onClick={() => setMobileSection('chats')}
                >
                  Chats
                </button>
                <button
                  type="button"
                  className={`${styles.mobileTabBtn} ${mobileSection === 'groups' ? styles.mobileTabBtnActive : ''}`}
                  onClick={() => setMobileSection('groups')}
                >
                  Communities
                </button>
              </div>
            )}

            {!adminMode && showGroupSections && (
              <>
                <div className={styles.sectionTitle}>General</div>
                {grouped.general.map((r) => (
                  <div key={r.room_id} className={styles.roomRowSingle}>
                    <button
                      type="button"
                      className={`${styles.roomBtn} ${String(activeRoomId) === String(r.room_id) ? styles.roomBtnActive : ''}`}
                      onClick={() => {
                        setShowMore(false);
                        setShowSearch(false);
                        setSearchQuery('');
                        setActiveRoomId(String(r.room_id));
                        if (isMobileView) setMobilePanel('chat');
                      }}
                    >
                      <span className={styles.roomName}>{roomLabel(r, selfCandId)}</span>
                      {badgeText(r.unread_count) && <span className={styles.badge}>{badgeText(r.unread_count)}</span>}
                    </button>
                  </div>
                ))}
              </>
            )}

            {showGroupSections && grouped.admin.length > 0 && <div className={styles.sectionTitle}>{adminMode ? 'All Admin Chat' : 'Admin'}</div>}
            {showGroupSections && grouped.admin.map((r) => (
              <div key={r.room_id} className={styles.roomRowSingle}>
                <button
                  type="button"
                  className={`${styles.roomBtn} ${String(activeRoomId) === String(r.room_id) ? styles.roomBtnActive : ''}`}
                  onClick={() => {
                    setShowMore(false);
                    setShowSearch(false);
                    setSearchQuery('');
                    setActiveRoomId(String(r.room_id));
                    if (isMobileView) setMobilePanel('chat');
                  }}
                >
                  <span className={styles.roomName}>{roomLabel(r, selfCandId)}</span>
                  {badgeText(r.unread_count) && <span className={styles.badge}>{badgeText(r.unread_count)}</span>}
                </button>
              </div>
            ))}

            {!adminMode && showGroupSections && (
              <>
                <div className={styles.sectionTitle}>Department</div>
                {grouped.dept.map((r) => (
                  <div key={r.room_id} className={styles.roomRowSingle}>
                    <button
                      type="button"
                      className={`${styles.roomBtn} ${String(activeRoomId) === String(r.room_id) ? styles.roomBtnActive : ''}`}
                      onClick={() => {
                        setShowMore(false);
                        setShowSearch(false);
                        setSearchQuery('');
                        setActiveRoomId(String(r.room_id));
                        if (isMobileView) setMobilePanel('chat');
                      }}
                    >
                      <span className={styles.roomName}>{roomLabel(r, selfCandId)}</span>
                      {badgeText(r.unread_count) && <span className={styles.badge}>{badgeText(r.unread_count)}</span>}
                    </button>
                  </div>
                ))}

                <div className={styles.sectionTitle}>Center</div>
                {pendingInvites.length > 0 && (
                  <div className={styles.morePanel}>
                    <div className={styles.moreTitle}>Invites</div>
                    {pendingInvites.slice(0, 4).map((inv) => (
                      <div key={inv.invite_id} className={styles.moreRow}>
                        <span className={styles.moreValue}>
                          {inv.room_name} {inv.from_name ? `• from ${inv.from_name}` : ''}
                        </span>
                        <span className={styles.moreValue}>
                          <button type="button" className={styles.primaryBtn} onClick={() => onRespondInvite(inv.invite_id, 'accept')}>
                            Accept
                          </button>
                          <button type="button" className={styles.smallBtnDanger} onClick={() => onRespondInvite(inv.invite_id, 'reject')}>
                            Reject
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {grouped.center.map((r) => (
                  <div key={r.room_id} className={styles.roomRowSingle}>
                    <button
                      type="button"
                      className={`${styles.roomBtn} ${String(activeRoomId) === String(r.room_id) ? styles.roomBtnActive : ''}`}
                      onClick={() => {
                        setShowMore(false);
                        setShowSearch(false);
                        setSearchQuery('');
                        setActiveRoomId(String(r.room_id));
                        if (isMobileView) setMobilePanel('chat');
                      }}
                    >
                      <span className={styles.roomName}>{roomLabel(r, selfCandId)}</span>
                      {badgeText(r.unread_count) && <span className={styles.badge}>{badgeText(r.unread_count)}</span>}
                    </button>
                  </div>
                ))}
              </>
            )}

            {showPersonalSection && (
              <>
                <div className={styles.sectionTitle}>Personal</div>
                <input
                  className={styles.searchInput}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by name / ID"
                />
                {searchingUsers && <div className={styles.mutedText}>Searching…</div>}
                {userResults.slice(0, 6).map((u) => (
                  <button key={u.cand_id} type="button" className={styles.userResultBtn} onClick={() => onStartDm(u.cand_id)}>
                    <span className={styles.userResultName}>{u.name || maskCandidateId(u.cand_id)}</span>
                    <span className={styles.userResultId}>{maskCandidateId(u.cand_id)}</span>
                  </button>
                ))}
                {grouped.dm.map((r) => (
                  <div key={r.room_id} className={styles.roomRowSingle}>
                    <button
                      type="button"
                      className={`${styles.roomBtn} ${String(activeRoomId) === String(r.room_id) ? styles.roomBtnActive : ''}`}
                      onClick={() => {
                        setShowMore(false);
                        setShowSearch(false);
                        setSearchQuery('');
                        setActiveRoomId(String(r.room_id));
                        if (isMobileView) setMobilePanel('chat');
                      }}
                    >
                      <span className={styles.roomName}>{roomLabel(r, selfCandId)}</span>
                      {badgeText(r.unread_count) && <span className={styles.badge}>{badgeText(r.unread_count)}</span>}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>
        )}

        {showChatRoomPanel && (
        <section className={styles.chatPanel}>
          <div className={styles.card}>
            <div className={styles.chatHeaderRow}>
              <div>
                {isMobileView && (
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.mobileBackBtn}`}
                    onClick={() => setMobilePanel('list')}
                    aria-label="Back to chats"
                    title="Back to chats"
                  >
                    <FaArrowLeft />
                  </button>
                )}
                <div className={styles.cardTitle}>{activeRoom ? roomLabel(activeRoom, selfCandId) : 'Chat'}</div>
                {activeRoom && (
                  <div className={styles.mutedText}>
                    {activeRoom.member_count ? `${activeRoom.member_count} members` : ''}
                  </div>
                )}
              </div>

              {activeRoom && (
                <div className={styles.headerActions}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${selectMode ? styles.iconBtnActive : ''}`}
                    onClick={() => {
                      setSelectMode((v) => !v);
                      if (selectMode) setSelectedMessages(new Set());
                    }}
                    aria-label="Select messages"
                    title="Select messages"
                  >
                    <FaCheckSquare />
                  </button>
                  {selectMode && selectedMessages.size > 0 && (
                    <button
                      type="button"
                      className={styles.deleteSelectedBtn}
                      onClick={onDeleteSelectedMessages}
                      aria-label={`Delete ${selectedMessages.size} message(s)`}
                      title={`Delete ${selectedMessages.size} message(s)`}
                    >
                      <FaTrash /> Delete ({selectedMessages.size})
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => {
                      setShowMore(false);
                      setShowSearch((v) => !v);
                      if (showSearch) setSearchQuery('');
                    }}
                    aria-label="Search"
                  >
                    {showSearch ? <FaTimes /> : <FaSearch />}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                      setShowMore((v) => !v);
                    }}
                    aria-label="More"
                  >
                    <FaEllipsisV />
                  </button>
                </div>
              )}
            </div>

            {activeRoom && showSearch && (
              <div className={styles.searchBar}>
                <input
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages in this chat"
                />
                {searchQuery && <div className={styles.mutedText}>{filteredMessages.length} result(s)</div>}
              </div>
            )}

            <div className={styles.messagesWrap}>
              {filteredMessages.filter(m => !m.deleted_at).map((m) => {
                const mine = String(m.sender_cand_id) === selfCandId;
                const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                const isImage = isImageAttachment(m);
                const hasAttachment = Boolean(m.attachment_url);
                const statusState = String(m.status?.state || 'sent');
                const isSelected = selectedMessages.has(String(m._id));
                const canDeleteSelf = mine && m.createdAt && (Date.now() - new Date(m.createdAt).getTime()) / 1000 <= 60;
                const canDelete = canDeleteSelf || isAdminSelf;
                return (
                  <div key={m._id} className={`${styles.bubbleRow} ${mine ? styles.bubbleRowSelf : ''} ${isSelected ? styles.bubbleRowSelected : ''}`}>
                    {selectMode && (
                      <button
                        type="button"
                        className={styles.selectCheckbox}
                        onClick={() => onToggleSelectMessage(m._id)}
                        aria-label={`Select message ${m._id}`}
                      >
                        {isSelected ? <FaCheckSquare /> : <FaSquare />}
                      </button>
                    )}
                    <div
                      ref={(node) => {
                        if (node) messageRefs.current.set(String(m._id), node);
                        else messageRefs.current.delete(String(m._id));
                      }}
                      className={`${styles.bubble} ${mine ? styles.bubbleSelf : styles.bubbleOther} ${highlightedMessageId === String(m._id) ? styles.bubbleHighlight : ''}`}
                    >
                      <div className={styles.bubbleMeta}>
                        <span className={styles.bubbleSender}>{mine ? 'You' : m.sender_name || maskCandidateId(m.sender_cand_id)}</span>
                        <span className={styles.bubbleTimeWrap}>
                          <span className={styles.bubbleTime}>{time}</span>
                          {mine && (
                            <span className={`${styles.tick} ${statusState === 'read' ? styles.tickRead : ''}`} title={statusState}>
                              {statusState === 'sending' ? <span className={styles.tickPending}>...</span> : statusState === 'sent' ? <FaCheck /> : <FaCheckDouble />}
                            </span>
                          )}
                        </span>
                      </div>

                      {m.reply_to && (
                        <button
                          type="button"
                          className={styles.replyBlock}
                          onClick={() => jumpToMessage(m.reply_to?._id)}
                        >
                          <span className={styles.replyAuthor}>{String(m.reply_to.sender_name || 'Message')}</span>
                          <span className={styles.replyText}>
                            {String(m.reply_to.text || m.reply_to.attachment_name || '').slice(0, 90) || 'Attachment'}
                          </span>
                        </button>
                      )}

                      {m.text ? <div className={styles.bubbleText}>{m.text}</div> : null}

                      {hasAttachment && isImage && (
                        <div className={styles.attachmentWrap}>
                          {attachmentObjectUrls[String(m._id)] ? (
                            <div className={styles.attachmentImageStack}>
                              {attachmentThumbUrls[String(m._id)] && !loadedAttachmentIds[String(m._id)] ? (
                                <img
                                  src={attachmentThumbUrls[String(m._id)]}
                                  alt="thumbnail"
                                  className={`${styles.attachmentImage} ${styles.attachmentImageThumb}`}
                                />
                              ) : null}
                              <img
                                src={attachmentObjectUrls[String(m._id)]}
                                alt={m.attachment_name || 'attachment'}
                                className={`${styles.attachmentImage} ${loadedAttachmentIds[String(m._id)] ? styles.attachmentImageSharp : styles.attachmentImageBlur}`}
                                onLoad={() => setLoadedAttachmentIds((prev) => ({ ...prev, [String(m._id)]: true }))}
                                onClick={() => setExpandedImageUrl(attachmentObjectUrls[String(m._id)])}
                                style={{ cursor: 'pointer' }}
                                title="Click to expand"
                              />
                            </div>
                          ) : loadingAttachmentIds[String(m._id)] ? (
                            <div className={styles.attachmentLoading}>Loading material...</div>
                          ) : failedAttachmentIds[String(m._id)] ? (
                            <a className={styles.attachmentLink} href={m.attachment_url} target="_blank" rel="noreferrer">
                              <span className={styles.attachmentFile}>Open image: {m.attachment_name || 'image'}</span>
                            </a>
                          ) : (
                            <div className={styles.attachmentLoading}>Loading material...</div>
                          )}
                        </div>
                      )}

                      {hasAttachment && !isImage && (
                        <a className={styles.attachmentLink} href={m.attachment_url} target="_blank" rel="noreferrer">
                          <span className={styles.attachmentFile}>Open attachment: {m.attachment_name || 'file'}</span>
                        </a>
                      )}

                      {m.reactions && Array.isArray(m.reactions) && m.reactions.length > 0 && (
                        <div className={styles.reactionsWrap}>
                          {m.reactions.map((reaction, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={styles.reactionBubble}
                              onClick={() => onAddReaction(m._id, reaction.emoji)}
                              title={`Reacted by: ${reaction.users.map((id) => maskCandidateId(id)).join(', ')}`}
                            >
                              <span>{reaction.emoji}</span>
                              {reaction.users.length > 1 && <span className={styles.reactionCount}>{reaction.users.length}</span>}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={styles.addReactionBtn}
                            onClick={() => setShowReactionPicker(String(m._id))}
                            title="Add reaction"
                          >
                            <FaSmile />
                          </button>
                        </div>
                      )}

                      {(!m.reactions || m.reactions.length === 0) && (
                        <div className={styles.reactionsWrap}>
                          <button
                            type="button"
                            className={styles.addReactionBtn}
                            onClick={() => setShowReactionPicker(String(m._id))}
                            title="Add reaction"
                          >
                            <FaSmile />
                          </button>
                        </div>
                      )}

                      {showReactionPicker === String(m._id) && (
                        <div className={styles.reactionPickerWrap}>
                          <Picker
                            data={data}
                            onEmojiSelect={(e) => onAddReaction(m._id, e.native)}
                            theme="light"
                            navPosition="top"
                            perLine={8}
                            maxFrequentRows={1}
                          />
                        </div>
                      )}

                      <div className={styles.bubbleActions}>
                        <button type="button" className={styles.replyBtn} onClick={() => setReplyingTo(m)}>
                          Reply
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => onDeleteMessage(m._id)}
                            title="Delete message"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {replyingTo && (
              <div className={styles.replyingBar}>
                <div className={styles.replyingText}>
                  Replying to {String(replyingTo.sender_name || maskCandidateId(replyingTo.sender_cand_id) || 'message')}: {String(replyingTo.text || replyingTo.attachment_name || '').slice(0, 90) || 'Attachment'}
                </div>
                <button type="button" className={styles.replyCancelBtn} onClick={() => setReplyingTo(null)}>
                  <FaTimes />
                </button>
              </div>
            )}

            <div className={styles.composer}>
              <div className={styles.composerInputWrap} ref={emojiWrapRef}>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      showToast('Attachment must be 10MB or less.', 'warning');
                      e.target.value = '';
                      return;
                    }
                    setSelectedAttachment(file);
                    e.target.value = '';
                  }}
                />
                <input
                  className={styles.composerInput}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                  disabled={!canType}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mentionResults.length && mentionQuery) {
                      e.preventDefault();
                      onSelectMention(mentionResults[0]);
                      return;
                    }
                    if (e.key === 'Enter') onSend();
                  }}
                />

                <button
                  type="button"
                  className={styles.attachBtn}
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={!canType}
                  title="Attach file"
                  aria-label="Attach file"
                >
                  <FaPaperclip />
                </button>

                <button
                  type="button"
                  className={styles.emojiBtn}
                  onClick={() => setShowEmoji((v) => !v)}
                  disabled={!canType}
                  title="Emoji"
                  aria-label="Emoji"
                >
                  <FaRegSmile />
                </button>

                {showEmoji && (
                  <div className={styles.emojiPickerPopover}>
                    <Picker
                      data={data}
                      onEmojiSelect={(e) => {
                        const native = e?.native || '';
                        if (!native) return;
                        setInput((prev) => `${prev}${native}`);
                        setShowEmoji(false);
                      }}
                      theme="light"
                      previewPosition="none"
                    />
                  </div>
                )}

                {mentionResults.length > 0 && (
                  <div className={styles.mentionDropdown}>
                    {mentionResults.map((member) => (
                      <button
                        key={member.cand_id}
                        type="button"
                        className={styles.mentionOption}
                        onClick={() => onSelectMention(member)}
                      >
                        <span>{member.name || member.cand_id}</span>
                        <span className={styles.mentionMeta}>{member.cand_id}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedAttachment && (
                  <div className={styles.attachmentChip}>
                    <span>{selectedAttachment.name}</span>
                    <button
                      type="button"
                      className={styles.chipClose}
                      onClick={() => setSelectedAttachment(null)}
                      aria-label="Remove attachment"
                    >
                      <FaTimes />
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className={styles.sendBtn} onClick={onSend} disabled={!canType}>
                <FaPaperPlane />
              </button>
            </div>
            {!canType && <div className={styles.mutedText} style={{ marginTop: 8 }}>You cannot send messages in this chat.</div>}
          </div>
        </section>
        )}
      </div>

      {!adminMode && showCreateCenter && (
        <>
          <div className={styles.modalOverlay} onClick={() => setShowCreateCenter(false)} />
          <div className={`${styles.card} ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.moreTitle}>Create Center</div>
            <input
              className={styles.searchInput}
              value={createCenterName}
              onChange={(e) => setCreateCenterName(e.target.value)}
              placeholder="Center name"
            />
            <div style={{ height: 8 }} />
            <input
              className={styles.searchInput}
              value={createCenterDescription}
              onChange={(e) => setCreateCenterDescription(e.target.value)}
              placeholder="Center description"
            />
            <div style={{ height: 10 }} />
            <button type="button" className={styles.primaryBtn} onClick={() => onCreateCenter()}>
              Create
            </button>
          </div>
        </>
      )}

      {activeRoom && showMore && (
        <>
          <div
            className={styles.moreOverlay}
            onClick={() => {
              setShowMore(false);
              setInviteSearch('');
              setInviteResults([]);
            }}
          />
          <div className={`${styles.morePanel} ${styles.morePanelFloating}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.moreTitle}>Chat info</div>
            <div className={styles.moreRow}>
              <span className={styles.moreLabel}>Name</span>
              <span className={styles.moreValue}>{roomLabel(activeRoom, selfCandId)}</span>
            </div>
            {activeRoom.description && (
              <div className={styles.moreRow}>
                <span className={styles.moreLabel}>About</span>
                <span className={styles.moreValue}>{activeRoom.description}</span>
              </div>
            )}
            <div className={styles.moreRow}>
              <span className={styles.moreLabel}>Members</span>
              <span className={styles.moreValue}>{activeRoom.member_count || 0}</span>
            </div>
            <div className={styles.moreRow}>
              <span className={styles.moreLabel}>Created</span>
              <span className={styles.moreValue}>{activeRoom.createdAt ? new Date(activeRoom.createdAt).toLocaleDateString() : ''}</span>
            </div>
            <div className={styles.moreRow}>
              <span className={styles.moreLabel}>Created by</span>
              <span className={styles.moreValue}>{activeRoom.created_by_name || maskCandidateId(activeRoom.created_by) || '-'}</span>
            </div>

            <div className={styles.moreActions}>
              {activeRoom.type === 'center' && activeRoom.invite_code && (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={async () => {
                    try {
                      const link = `${window.location.origin}/candidate/chat?invite=${activeRoom.invite_code}`;
                      await navigator.clipboard.writeText(link);
                      showToast('Invite link copied', 'success');
                    } catch (err) {
                      showToast(getErrorMessage(err, 'Failed to copy invite link'), 'error');
                    }
                  }}
                >
                  Copy invite
                </button>
              )}

              {activeRoom.type === 'dm' && (
                <button type="button" className={styles.primaryBtn} onClick={onToggleBlock}>
                  {activeRoom.dm_blocked_by_me ? 'Unblock' : 'Block'}
                </button>
              )}

              {activeRoom?.muted != null && (
                <button type="button" className={styles.primaryBtn} onClick={() => onToggleMute(activeRoom)}>
                  {activeRoom.muted ? 'Unmute' : 'Mute'}
                </button>
              )}

              <button
                type="button"
                className={styles.smallBtnDanger}
                onClick={async () => {
                  try {
                    await api.post(`/chat/rooms/${encodeURIComponent(activeRoom.room_id)}/clear`);
                    setMessages([]);
                    showToast('Chat cleared', 'success');
                  } catch (err) {
                    showToast(getErrorMessage(err, 'Failed to clear chat'), 'error');
                  }
                }}
              >
                Clear chat
              </button>
              {activeRoom.type !== 'admin' && (
                <button type="button" className={styles.smallBtnDanger} onClick={() => onLeave(activeRoom)}>
                  Leave
                </button>
              )}
            </div>

            <div className={styles.membersList}>
              <div className={styles.moreTitle}>Members</div>
              <input
                className={styles.searchInput}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members"
              />
              <div style={{ height: 8 }} />
              {loadingMembers && <div className={styles.mutedText}>Loading…</div>}
              {!loadingMembers && members.map((m) => (
                <button
                  key={m.cand_id}
                  type="button"
                  className={styles.memberRowBtn}
                  onClick={async () => {
                    await onStartDm(m.cand_id);
                    setShowMore(false);
                  }}
                >
                  <div className={styles.memberRowName}>{m.name || maskCandidateId(m.cand_id)}</div>
                  <div className={styles.memberRowMeta}>
                    {m.department_abbreviation || m.department_name || ''}
                  </div>
                </button>
              ))}
            </div>

            {activeRoom.type === 'center' && (
              <div className={styles.searchBar}>
                <div className={styles.moreTitle}>Invite members</div>
                <input
                  className={styles.searchInput}
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Invite users by name / ID"
                />
                {searchingInviteUsers && <div className={styles.mutedText}>Searching…</div>}
                {inviteResults.slice(0, 6).map((u) => (
                  <button key={u.cand_id} type="button" className={styles.userResultBtn} onClick={() => onSendCenterInvite(u.cand_id)}>
                    <span className={styles.userResultName}>{u.name || maskCandidateId(u.cand_id)}</span>
                    <span className={styles.userResultId}>{maskCandidateId(u.cand_id)}</span>
                  </button>
                ))}
              </div>
            )}

      {expandedImageUrl && (
        <div className={styles.imageModal} onClick={() => setExpandedImageUrl(null)}>
          <div className={styles.imageModalContent} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.imageModalClose}
              onClick={() => setExpandedImageUrl(null)}
              aria-label="Close"
            >
              <FaTimes />
            </button>
            <img src={expandedImageUrl} alt="expanded" className={styles.imageModalImage} />
          </div>
        </div>
      )}
          </div>
        </>
      )}

      <PaymentActionModal
        isOpen={Boolean(paymentRequest)}
        title={paymentRequest?.title || ''}
        description={paymentRequest?.description || ''}
        amount={paymentRequest?.amount || 0}
        currency={paymentRequest?.currency || 'XAF'}
        onClose={() => setPaymentRequest(null)}
        onStartPayment={paymentRequest?.onStartPayment}
        onSuccess={async (result) => {
          await paymentRequest?.onSuccess?.(result);
          setPaymentRequest(null);
        }}
      />
    </div>
  );
};

export default GroupChat;

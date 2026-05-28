import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRobot } from 'react-icons/fa';
import styles from '../Astyles/FloatingAIIcon.module.css';

const DEFAULT_STORAGE_KEY = 'candidate_floating_ai_position_v1';
const FAB_SIZE = 58;
const EDGE_MARGIN = 12;
const DRAG_THRESHOLD = 6;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getViewportBounds = () => {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - FAB_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - FAB_SIZE - EDGE_MARGIN);
  return { minX: EDGE_MARGIN, minY: EDGE_MARGIN, maxX, maxY };
};

const getDefaultPosition = () => {
  const { maxX, maxY } = getViewportBounds();
  return { x: maxX, y: maxY - 72 };
};

export const FloatingAIIcon = ({
    targetPath = '/candidate/ai-assistant',
    storageKey = DEFAULT_STORAGE_KEY,
    ariaLabel = 'Open AI assistant',
    title = 'AI Assistant',
}) => {
    const navigate = useNavigate();
    const [position, setPosition] = useState(() => getDefaultPosition());
    const dragStateRef = useRef({
        dragging: false,
        pointerId: null,
        startClientX: 0,
        startClientY: 0,
        startX: 0,
        startY: 0,
        moved: false,
    });
    const fabRef = useRef(null);

    const persistPosition = useCallback((nextPosition) => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(nextPosition));
        } catch (_) {
        }
    }, [storageKey]);

    const updatePosition = useCallback((x, y) => {
        const { minX, minY, maxX, maxY } = getViewportBounds();
        const next = {
            x: clamp(x, minX, maxX),
            y: clamp(y, minY, maxY),
        };
        setPosition(next);
        persistPosition(next);
    }, [persistPosition]);

    useEffect(() => {
        try {
            const savedRaw = window.localStorage.getItem(storageKey);
            if (!savedRaw) return;
            const saved = JSON.parse(savedRaw);
            if (!Number.isFinite(saved?.x) || !Number.isFinite(saved?.y)) return;
            updatePosition(Number(saved.x), Number(saved.y));
        } catch (_) {
        }
    }, [storageKey, updatePosition]);

    useEffect(() => {
        const handleResize = () => updatePosition(position.x, position.y);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [position.x, position.y, updatePosition]);

    const onPointerDown = (event) => {
        const state = dragStateRef.current;
        state.dragging = true;
        state.pointerId = event.pointerId;
        state.startClientX = event.clientX;
        state.startClientY = event.clientY;
        state.startX = position.x;
        state.startY = position.y;
        state.moved = false;

        if (fabRef.current?.setPointerCapture) {
            fabRef.current.setPointerCapture(event.pointerId);
        }
    };

    const onPointerMove = (event) => {
        const state = dragStateRef.current;
        if (!state.dragging || state.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - state.startClientX;
        const deltaY = event.clientY - state.startClientY;

        if (!state.moved && Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD) {
            state.moved = true;
        }

        updatePosition(state.startX + deltaX, state.startY + deltaY);
    };

    const onPointerUp = (event) => {
        const state = dragStateRef.current;
        if (state.pointerId !== event.pointerId) return;

        if (fabRef.current?.releasePointerCapture) {
            try {
                fabRef.current.releasePointerCapture(event.pointerId);
            } catch (_) {
            }
        }

        const shouldNavigate = !state.moved;
        state.dragging = false;
        state.pointerId = null;

        if (shouldNavigate) {
            navigate(targetPath);
        }
    };

    const onKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            navigate(targetPath);
        }
    };

    return (
        <button
            ref={fabRef}
            type="button"
            className={styles.aiIcon}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            aria-label={ariaLabel}
            title={title}
        >
            <FaRobot />
        </button>
    );
};

export default FloatingAIIcon;
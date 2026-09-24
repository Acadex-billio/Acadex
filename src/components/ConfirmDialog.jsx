import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.64)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  zIndex: 2000,
};

const dialogStyle = {
  width: 'min(100%, 420px)',
  background: '#fff',
  borderRadius: '18px',
  padding: '24px 20px 18px',
  boxShadow: '0 20px 45px rgba(15, 23, 42, 0.26)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
};

const titleStyle = {
  margin: 0,
  fontSize: '1.3rem',
  color: '#0f172a',
  lineHeight: 1.3,
};

const messageStyle = {
  margin: '12px 0 20px',
  color: '#475569',
  lineHeight: 1.6,
  fontSize: '0.98rem',
};

const actionRowStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  flexWrap: 'wrap',
};

const buttonStyle = {
  borderRadius: '10px',
  padding: '10px 16px',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'all 0.2s ease',
};

const cancelButtonStyle = {
  ...buttonStyle,
  background: '#f8fafc',
  color: '#0f172a',
  borderColor: '#dbe3ef',
};

const confirmButtonStyle = {
  ...buttonStyle,
  background: '#dc2626',
  color: '#fff',
  borderColor: '#dc2626',
};

const secondaryConfirmStyle = {
  ...buttonStyle,
  background: '#2563eb',
  color: '#fff',
  borderColor: '#2563eb',
};

const ConfirmDialog = ({
  open,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  destructive = true,
}) => {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onConfirm?.();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return createPortal(
    <div style={overlayStyle} onClick={onCancel} aria-hidden={false}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={dialogStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" style={titleStyle}>{title}</h3>
        <p style={messageStyle}>{message}</p>
        <div style={actionRowStyle}>
          <button type="button" style={cancelButtonStyle} onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            style={destructive ? confirmButtonStyle : secondaryConfirmStyle}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;

const personalizeMessage = (message, name) => {
  const recipientName = String(name || '').trim() || 'there';
  return String(message || '').replace(/@/g, () => recipientName);
};

module.exports = personalizeMessage;

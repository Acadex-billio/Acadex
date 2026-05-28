import React, { useState } from 'react';

const AddReportTopic = () => {
  const [topic, setTopic] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Logic to save the report topic goes here
    alert(`Report topic "${topic}" added!`);
    setTopic('');
  };

  return (
    <div>
      <h2>Add Report Topic</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Report Topic:
          <input 
            type="text" 
            value={topic} 
            onChange={(e) => setTopic(e.target.value)} 
            required 
          />
        </label>
        <button type="submit">Add Topic</button>
      </form>
    </div>
  );
};

export default AddReportTopic;
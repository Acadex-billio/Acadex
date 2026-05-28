import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <section className="container py-5 text-center" aria-labelledby="not-found-title">
      <h1 id="not-found-title" className="mb-3">Page not found</h1>
      <p className="text-muted mb-4">The page you requested does not exist or may have moved.</p>
      <Link to="/" className="btn btn-primary">Back to home</Link>
    </section>
  );
};

export default NotFound;

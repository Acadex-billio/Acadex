/**
 * JWT Authentication Service
 * Handles JWT token storage, retrieval, and management
 */

class AuthService {
  // Store JWT token
  setToken(token) {
    localStorage.setItem('jwt_token', token);
  }

  // Get JWT token
  getToken() {
    return localStorage.getItem('jwt_token');
  }

  // Remove JWT token
  removeToken() {
    localStorage.removeItem('jwt_token');
  }

  // Check if user is authenticated
  isAuthenticated() {
    const token = this.getToken();
    return !!token;
  }

  // Get Authorization header
  getAuthHeader() {
    const token = this.getToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  // Parse JWT token payload
  parseToken() {
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error parsing JWT token:', error);
      return null;
    }
  }

  // Get user info from token
  getCurrentUser() {
    const tokenData = this.parseToken();
    return tokenData ? tokenData : null;
  }

  // Check if token is expired
  isTokenExpired() {
    const tokenData = this.parseToken();
    if (!tokenData || !tokenData.exp) return true;
    
    const currentTime = Date.now() / 1000;
    return tokenData.exp < currentTime;
  }

  // Auto-refresh token if needed
  async refreshTokenIfNeeded() {
    if (this.isTokenExpired()) {
      this.removeToken();
      return false;
    }
    return true;
  }
}

const authService = new AuthService();
export default authService;

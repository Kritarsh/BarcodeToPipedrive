import axios from 'axios';

// Use environment variable in production, fallback in development
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Create pre-configured axios instance
export const api = axios.create({
  baseURL: API_URL
});

// Export the base URL for direct use
export const getApiUrl = () => API_URL;

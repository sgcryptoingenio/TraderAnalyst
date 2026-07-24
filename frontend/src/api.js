// src/api.js
// Configuración centralizada del cliente API.
// En desarrollo apunta a localhost; en producción usará la variable VITE_API_URL de Vercel.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default API_BASE;

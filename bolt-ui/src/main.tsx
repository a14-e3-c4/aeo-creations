import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { FreeAvatarStudio } from './components/FreeAvatarStudio';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <FreeAvatarStudio />
  </StrictMode>
);

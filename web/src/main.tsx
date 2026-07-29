import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { GuestProvider, StaffProvider } from './state';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GuestProvider>
        <StaffProvider>
          <App />
        </StaffProvider>
      </GuestProvider>
    </BrowserRouter>
  </StrictMode>,
);

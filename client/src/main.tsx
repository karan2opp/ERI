import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import './index.css';

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_bWlnaHR5LXR1cnRsZS02MDI0LmNsZXJrLmFjY291bnRzLmRldiQ';

// Clerk's sign-in modal in the Earth Revival Initiative greens, above the map's sheets and menus
const clerkAppearance = {
  variables: {
    colorPrimary: '#2c691c',
    colorTextOnPrimaryBackground: '#ffffff',
    colorText: '#133c16',
    colorBackground: '#ffffff',
    colorInputBackground: '#f0f6ea',
    borderRadius: '1rem',
    fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    modalBackdrop: { zIndex: 5000 },
    formButtonPrimary: { borderRadius: '999px', height: '48px', fontSize: '16px', textTransform: 'none' as const },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={rawKey} appearance={clerkAppearance}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);

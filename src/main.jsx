import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AudioProvider } from './context/AudioContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AudioProvider>
          <App />
        </AudioProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker registered successfully with scope:', reg.scope);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });

  // We DO NOT automatically reload the page on 'controllerchange'.
  // Auto-reloading can cause infinite refresh loops if the browser constantly detects SW changes.
  // Instead, the user will get the new version on their next natural page navigation or refresh.
}

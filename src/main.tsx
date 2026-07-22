import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Avoid React StrictMode double-mount killing WebGL/Audio during local demo
createRoot(document.getElementById('root')!).render(<App />);

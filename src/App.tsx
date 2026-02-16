import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import AuthGuard from './components/AuthGuard';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import ConceptPage from './pages/wizard/ConceptPage';
import ConfigurationPage from './pages/wizard/ConfigurationPage';
import BlueprintPage from './pages/wizard/BlueprintPage';
import ProductionPage from './pages/wizard/ProductionPage';
import CoverPage from './pages/wizard/CoverPage';
import ExportPage from './pages/wizard/ExportPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Styles
import './index.css';

const App: React.FC = () => {

  useEffect(() => {
    console.log("%c ฅ^•ﻌ•^ฅ W4U Wizard Reborn!", "color: #6366f1; font-weight: bold; font-size: 14px;");
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected routes */}
              <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
                <Route index element={<Dashboard />} />

                <Route path="create">
                  <Route path="concept" element={<ConceptPage />} />
                  <Route path="configuration" element={<ConfigurationPage />} />
                  <Route path="blueprint" element={<BlueprintPage />} />
                  <Route path="production" element={<ProductionPage />} />
                  <Route path="cover" element={<CoverPage />} />
                  <Route path="export" element={<ExportPage />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;

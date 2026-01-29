import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import ConceptPage from './pages/wizard/ConceptPage';
import ConfigurationPage from './pages/wizard/ConfigurationPage';
import BlueprintPage from './pages/wizard/BlueprintPage';
import ProductionPage from './pages/wizard/ProductionPage';
import EditorPage from './pages/wizard/EditorPage';
import ExportPage from './pages/wizard/ExportPage';

// Styles
import './index.css';

const App: React.FC = () => {

  useEffect(() => {
    console.log("%c ฅ^•ﻌ•^ฅ W4U Wizard Reborn!", "color: #6366f1; font-weight: bold; font-size: 14px;");
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />

          <Route path="create">
            <Route path="concept" element={<ConceptPage />} />
            <Route path="configuration" element={<ConfigurationPage />} />
            <Route path="blueprint" element={<BlueprintPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="editor" element={<EditorPage />} />
            <Route path="export" element={<ExportPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;

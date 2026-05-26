import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import HomePage from "./pages/HomePage";
import Index from "./pages/Index";
import HistoryPage from "./pages/HistoryPage";
import AnalysisPage from "./pages/AnalysisPage";
import TerminalAnalysisPage from "./pages/TerminalAnalysisPage";
import PatternsPage from "./pages/PatternsPage";
import ForecastPage from "./pages/ForecastPage";
import NotFound from "./pages/NotFound";
import { syncOnceResults } from "./lib/onceResultsSync";

const App = () => {
  useEffect(() => {
    void syncOnceResults(true).catch(() => {});

    const interval = window.setInterval(() => {
      void syncOnceResults(false).catch(() => {});
    }, 15 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/generador" element={<Index />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/terminales" element={<TerminalAnalysisPage />} />
          <Route path="/patrones" element={<PatternsPage />} />
          <Route path="/pronostico" element={<ForecastPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
};

export default App;

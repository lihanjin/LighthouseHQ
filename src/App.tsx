import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import ProjectPages from "@/pages/ProjectPages";
import ProjectPageForm from "@/pages/ProjectPageForm";
import TaskDetail from "@/pages/TaskDetail";
import ReportDetail from "@/pages/ReportDetail";
import { Layout } from "antd";

const { Header, Content } = Layout;

export default function App() {
  return (
    <Router>
      <Layout className="min-h-screen">
        <Header className="flex items-center">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="14" cy="14" r="13" fill="#1677ff" stroke="#4096ff" strokeWidth="1"/>
              {/* Gauge arc */}
              <path d="M7 18 A8 8 0 0 1 21 18" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <path d="M7 18 A8 8 0 0 1 17.5 10.1" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              {/* Needle */}
              <line x1="14" y1="18" x2="17.8" y2="10.5" stroke="#52c41a" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="14" cy="18" r="1.8" fill="white"/>
            </svg>
            <span className="text-white text-base font-semibold tracking-wide">Lighthouse HQ</span>
          </div>
        </Header>
        <Content>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/create" element={<ProjectDetail />} />
            <Route path="/projects/:id" element={<ProjectPages />} />
            <Route path="/projects/:id/pages/add" element={<ProjectPageForm />} />
            <Route path="/projects/:id/pages/edit" element={<ProjectPageForm />} />
            <Route path="/projects/:id/settings" element={<ProjectDetail />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/reports/:reportId" element={<ReportDetail />} />
          </Routes>
        </Content>
      </Layout>
    </Router>
  );
}

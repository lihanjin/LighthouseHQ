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
          <div className="text-white text-xl font-bold">Lighthouse HQ</div>
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

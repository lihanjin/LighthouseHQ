import React, { useEffect, useState } from 'react'
import { Select, Divider, Button, Space, Typography, Avatar } from 'antd'
import { PlusOutlined, SettingOutlined, AppstoreOutlined, UserOutlined, ProjectOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'

const { Option } = Select
const { Text } = Typography

export default function ProjectSwitcher() {
  const [projects, setProjects] = useState<any[]>([])
  const [currentId, setCurrentId] = useState<string | undefined>(undefined)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    loadProjects()
  }, [])

  // Update selection based on URL
  useEffect(() => {
    const match = location.pathname.match(/\/projects\/([a-zA-Z0-9-]+)/)
    if (match && match[1] !== 'create') {
      setCurrentId(match[1])
    } else {
      setCurrentId(undefined)
    }
  }, [location.pathname])

  const loadProjects = async () => {
    try {
        const res = await api.projects.list()
        if (res.success) {
            setProjects(res.data)
        }
    } catch (e) {
        console.error("Failed to load projects", e)
    }
  }

  return (
    <Select
      value={currentId}
      placeholder={
        <Space>
           <ProjectOutlined />
           <span>选择项目</span>
        </Space>
      }
      style={{ width: 240 }}
      className="project-switcher"
      bordered={true}
      showSearch
      filterOption={(input, option) =>
        (option?.children as unknown as string).toLowerCase().indexOf(input.toLowerCase()) >= 0
      }
      dropdownRender={menu => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <Space direction="vertical" style={{ padding: '0 4px', width: '100%' }} size={0}>
            <Button 
                type="text" 
                block 
                icon={<AppstoreOutlined />} 
                onClick={() => navigate('/projects')} 
                style={{ textAlign: 'left', fontWeight: 500 }}
            >
              管理项目
            </Button>
          </Space>
        </>
      )}
      onChange={(val) => {
          navigate(`/projects/${val}`)
      }}
      optionLabelProp="label"
    >
      {projects.map(p => (
        <Option key={p.id} value={p.id} label={
            <Space>
                <div className="bg-blue-500 w-4 h-4 rounded-sm flex items-center justify-center">
                    <ProjectOutlined style={{ fontSize: 10, color: 'white' }} />
                </div>
                {p.name}
            </Space>
        }>
            <Space>
                <div className="bg-blue-500 w-6 h-6 rounded flex items-center justify-center">
                    <ProjectOutlined style={{ fontSize: 14, color: 'white' }} />
                </div>
                <Text strong>{p.name}</Text>
            </Space>
        </Option>
      ))}
    </Select>
  )
}

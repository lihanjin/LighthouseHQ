import React, { useEffect, useState } from 'react'
import { Table, Button, Space, message, Card, Typography, Modal, Tooltip, Progress, Form, Input } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, CopyOutlined, ProjectOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const { Title, Text } = Typography

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await api.projects.list()
      if (res.success) {
        setProjects(res.data)
      } else {
        message.error(res.error)
      }
    } catch (error) {
      message.error('获取项目失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleCreate = () => {
    setEditingProject(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProject(record)
    form.setFieldsValue({ name: record.name })
    setIsModalVisible(true)
  }

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields()
      if (editingProject) {
        await api.projects.update(editingProject.id, values)
        message.success('项目已更新')
      } else {
        await api.projects.create(values)
        message.success('项目已创建')
      }
      setIsModalVisible(false)
      fetchProjects()
    } catch (error) {
      console.error(error)
      // message.error('操作失败') // validateFields will throw, no need to show generic error if it's validation
    }
  }

  const handleModalCancel = () => {
    setIsModalVisible(false)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个项目吗？相关的检测记录也会被删除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.projects.delete(id)
          message.success('项目已删除')
          fetchProjects()
        } catch (error) {
          message.error('删除项目失败')
        }
      }
    })
  }

  const columns = [
    {
      title: '项目',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white">
                <ProjectOutlined />
            </div>
            <div className="flex flex-col">
                <Text strong className="text-blue-600">{text}</Text>
                <Text type="secondary" className="text-xs">创建于 {new Date(record.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</Text>
            </div>
        </div>
      ),
    },
    {
      title: '最后访问',
      dataIndex: 'updated_at',
      key: 'last_accessed',
      render: (text: string) => <Text>{new Date(text || Date.now()).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</Text>
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: any) => (
        <Space size="small" className="text-gray-400">
            <Tooltip title="编辑">
                <Button type="text" icon={<EditOutlined />} onClick={(e) => handleEdit(record, e)} />
            </Tooltip>
            <Tooltip title="复制 (开发中)">
                <Button type="text" icon={<CopyOutlined />} disabled />
            </Tooltip>
            <Tooltip title="删除">
                <Button type="text" icon={<DeleteOutlined />} onClick={(e) => handleDelete(record.id, e)} />
            </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-[1200px] mx-auto">
          <div className="mb-6">
              <Title level={4}>项目列表</Title>
          </div>

          <div className="border rounded-md border-gray-200">
            <Table 
                columns={columns} 
                dataSource={projects} 
                rowKey="id" 
                loading={loading}
                pagination={false}
                rowClassName="hover:bg-gray-50 cursor-pointer"
                onRow={(record) => ({
                    onClick: () => navigate(`/projects/${record.id}`)
                })}
            />
            <div className="p-4 bg-white border-t border-gray-200">
                <Button type="primary" size="large" onClick={handleCreate}>
                    新建项目
                </Button>
            </div>
          </div>
      </div>

      <Modal
        title={editingProject ? "编辑项目" : "新建项目"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          name="project_form"
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

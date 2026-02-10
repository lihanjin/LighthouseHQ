import React, { useEffect, useState } from 'react'
import { Card, Typography, Descriptions, Tag, Progress, List, Button, Space, message } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined, FileSearchOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api, API_BASE_URL } from '../api'

const { Title } = Typography

export default function TaskDetail() {
  const [task, setTask] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const { id } = useParams()
  const navigate = useNavigate()

  const fetchTask = async () => {
    setLoading(true)
    try {
      const res = await api.tasks.getStatus(id!)
      if (res.success) {
        setTask(res.data)
      } else {
        message.error(res.error)
      }
    } catch (error) {
      message.error('Failed to fetch task')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTask()
    // Poll for status every 5 seconds if status is running or pending
    const interval = setInterval(() => {
      if (task?.status === 'running' || task?.status === 'pending') {
        fetchTask()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [id, task?.status])

  if (!task) return <div>Loading...</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} className="mb-4">
            返回列表
          </Button>
          <Title level={2}>检测任务详情</Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchTask} loading={loading}>
          刷新
        </Button>
      </div>

      <Card className="mb-6">
        <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 3, sm: 2, xs: 1 }}>
          <Descriptions.Item label="任务ID">{task.id}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={
              task.status === 'completed' ? 'green' : 
              task.status === 'failed' ? 'red' : 
              task.status === 'running' ? 'blue' : 'default'
            }>
              {task.status.toUpperCase()}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="进度">
            <Progress percent={task.progress} status={task.status === 'failed' ? 'exception' : 'active'} size="small" />
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(task.created_at).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="设备">{task.device}</Descriptions.Item>
          <Descriptions.Item label="网络">{task.network}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="检测结果">
        <List
          dataSource={task.reports || []}
          renderItem={(item: any) => (
            <List.Item>
              <List.Item.Meta
                title={<a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a>}
                description={
                  <div className="mt-2">
                    {item.status === 'completed' ? (
                        <Space wrap>
                          <Tag color="blue">Performance: {item.performance_score}</Tag>
                          <Tag color="cyan">Accessibility: {item.accessibility_score}</Tag>
                          <Tag color="green">Best Practices: {item.best_practices_score}</Tag>
                          <Tag color="purple">SEO: {item.seo_score}</Tag>
                        </Space>
                    ) : (
                        <span className="text-gray-400">检测进行中或已失败...</span>
                    )}
                  </div>
                }
              />
              <Space>
                {item.status === 'completed' && (
                  <Button 
                    type="link" 
                    icon={<FileSearchOutlined />}
                    onClick={() => window.open(`${API_BASE_URL}/reports/${item.id}`, '_blank')}
                  >
                    查看完整报告
                  </Button>
                )}
                <Tag color={item.status === 'completed' ? 'green' : 'default'}>
                  {item.status.toUpperCase()}
                </Tag>
              </Space>
            </List.Item>
          )}
          locale={{ emptyText: '暂无检测结果' }}
        />
      </Card>
    </div>
  )
}

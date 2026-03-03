import React, { useEffect, useState } from 'react'
import { Form, Input, Button, Card, Typography, Space, Select, Divider, message } from 'antd'
import { MinusCircleOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

const { Title } = Typography
const { Option } = Select

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function ProjectDetail() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = id && id !== 'create'

  useEffect(() => {
    if (isEdit) {
      fetchProject()
    } else {
      // Set defaults
      form.setFieldsValue({
        config: {
          device: 'desktop',
          network: 'fast4g',
          authType: 'none'
        }
      })
    }
  }, [id])

  const fetchProject = async () => {
    setLoading(true)
    try {
      const res = await api.projects.get(id!)
      if (res.success) {
        const { name, description, urls, default_config, history } = res.data
        form.setFieldsValue({
          name,
          description,
          urls: urls.map((url: string) => ({ url })), // Transform for Form.List
          config: default_config
        })
        if (history) {
            setHistory(history.map((h: any) => ({
                ...h,
                date: new Date(h.date).toLocaleDateString() + ' ' + new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            })))
        }
      } else {
        message.error(res.error)
      }
    } catch (error) {
      message.error('Failed to fetch project')
    } finally {
      setLoading(false)
    }
  }

  const onFinish = async (values: any) => {
    setLoading(true)
    try {
      // Transform urls back to string array
      const projectData = {
        name: values.name,
        description: values.description,
        urls: values.urls?.map((item: any) => item.url).filter(Boolean) || [],
        config: values.config
      }

      let res
      if (isEdit) {
        res = await api.projects.update(id!, projectData)
      } else {
        res = await api.projects.create(projectData)
      }

      if (res.success) {
        message.success(`Project ${isEdit ? 'updated' : 'created'} successfully`)
        navigate(isEdit ? `/projects/${id}` : '/projects')
      } else {
        message.error(res.error)
      }
    } catch (error) {
      message.error('Operation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(isEdit ? `/projects/${id}` : '/projects')} className="mb-4">
          {isEdit ? '返回项目概览' : '返回列表'}
        </Button>
        <Title level={2}>{isEdit ? '项目设置' : '新建项目'}</Title>
      </div>

      {isEdit && history.length > 0 && (
        <Card title="性能趋势 (最近20次)" className="mb-6">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#1890ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <CartesianGrid strokeDasharray="3 3" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="performance" stroke="#1890ff" fillOpacity={1} fill="url(#colorPerf)" name="性能评分" />
                <Area type="monotone" dataKey="accessibility" stroke="#52c41a" fillOpacity={0} fill="transparent" name="无障碍" />
                <Area type="monotone" dataKey="seo" stroke="#faad14" fillOpacity={0} fill="transparent" name="SEO" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        autoComplete="off"
      >
        <Card title="基本信息" className="mb-6">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：公司官网监控" />
          </Form.Item>
          <Form.Item
            name="description"
            label="项目描述"
          >
            <Input.TextArea placeholder="项目的简要描述" />
          </Form.Item>
        </Card>

        <Card title="检测页面列表" className="mb-6">
          <Form.List name="urls">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'url']}
                      rules={[{ required: true, message: '请输入URL' }, { type: 'url', message: '请输入有效的URL' }]}
                      className="w-[500px]"
                    >
                      <Input placeholder="https://example.com" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    添加页面 URL
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Card>

        <Card title="默认检测配置" className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name={['config', 'device']} label="设备类型" initialValue={['desktop']}>
              <Select mode="multiple" placeholder="请选择检测设备">
                <Option value="desktop">Desktop (桌面端)</Option>
                <Option value="mobile">Mobile (移动端)</Option>
              </Select>
            </Form.Item>
            
            <Form.Item name={['config', 'location']} label="检测位置 (模拟)" initialValue="us-east">
               <Select placeholder="请选择检测位置">
                 <Option value="us-east">🇺🇸 US East (N. Virginia)</Option>
                 <Option value="us-west">🇺🇸 US West (Oregon)</Option>
                 <Option value="eu-west">🇪🇺 EU West (Ireland)</Option>
                 <Option value="ap-southeast">🇸🇬 Asia Pacific (Singapore)</Option>
                 <Option value="cn-north">🇨🇳 China (Beijing)</Option>
               </Select>
            </Form.Item>

            <Form.Item name={['config', 'network']} label="网络环境" initialValue="fast4g">
              <Select>
                <Option value="wifi">WiFi (无限制)</Option>
                <Option value="fast4g">Fast 4G</Option>
                <Option value="slow3g">Slow 3G</Option>
              </Select>
            </Form.Item>
          </div>

          <Divider titlePlacement="left">认证设置 (可选)</Divider>
          
          <Form.Item name={['config', 'authType']} label="认证方式" initialValue="none">
             <Select>
               <Option value="none">无需认证</Option>
               <Option value="custom">自定义认证 (支持组合)</Option>
             </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.config?.authType !== currentValues.config?.authType}
          >
            {({ getFieldValue }) => {
              const authType = getFieldValue(['config', 'authType'])
              
              if (authType === 'custom') {
                return (
                  <div className="bg-gray-50 p-4 rounded space-y-4">
                    <Form.Item 
                      name={['config', 'cookies']} 
                      label="Cookie 数据 (JSON 数组)"
                      help='示例: [{"name": "session", "value": "xyz", "domain": "example.com"}]'
                    >
                      <Input.TextArea rows={4} placeholder="请输入 JSON 格式的 Cookie 数组" />
                    </Form.Item>

                    <Form.Item 
                      name={['config', 'localStorage']} 
                      label="LocalStorage 数据 (JSON 对象)"
                      help='示例: {"token": "xyz", "userId": "123"}'
                    >
                      <Input.TextArea rows={4} placeholder="请输入 JSON 格式的 LocalStorage 对象" />
                    </Form.Item>

                    <Form.Item 
                      name={['config', 'sessionStorage']} 
                      label="SessionStorage 数据 (JSON 对象)"
                      help='示例: {"session_id": "abc"}'
                    >
                      <Input.TextArea rows={4} placeholder="请输入 JSON 格式的 SessionStorage 对象" />
                    </Form.Item>
                  </div>
                )
              }
              
              return null
            }}
          </Form.Item>
        </Card>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large" block>
            保存项目
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}

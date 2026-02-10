import React, { useEffect, useState } from 'react'
import { Form, Input, Select, Button, message, Divider, Card, Typography } from 'antd'
import { MinusCircleOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'

const { Title } = Typography
const { Option } = Select

export default function ProjectPageForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [project, setProject] = useState<any>(null)
  
  // Identify if we are editing a specific page (by index for now, as URLs might change)
  const editIndex = searchParams.get('index')
  const isEdit = editIndex !== null

  useEffect(() => {
    fetchProject()
  }, [id])

  const fetchProject = async () => {
    try {
      const res = await api.projects.get(id!)
      if (res.success) {
        const proj = res.data
        setProject(proj)
        
        // Set initial values
        if (isEdit) {
          const index = parseInt(editIndex!)
          const urls = proj.urls || []
          const target = urls[index]
          if (target) {
            const pageData = typeof target === 'string' ? { url: target, title: '' } : target
            form.setFieldsValue({
              pages: [pageData], // Only show the one being edited
              // Keep config fields but maybe disable them or hide them if we only edit URL?
              // For now, let's allow editing config too as it seems to be global
              devices: proj.default_config?.device || ['desktop'],
              location: Array.isArray(proj.default_config?.location) ? proj.default_config.location : [proj.default_config?.location || 'us-east'],
              frequency: '24h',
              cookies: proj.default_config?.cookies ? JSON.stringify(proj.default_config.cookies) : undefined,
              localStorage: proj.default_config?.localStorage ? JSON.stringify(proj.default_config.localStorage) : undefined,
              sessionStorage: proj.default_config?.sessionStorage ? JSON.stringify(proj.default_config.sessionStorage) : undefined
            })
          }
        } else {
          // Add mode
          form.setFieldsValue({
            devices: proj.default_config?.device || ['desktop'],
            location: Array.isArray(proj.default_config?.location) ? proj.default_config.location : [proj.default_config?.location || 'us-east'],
            frequency: '24h',
            pages: [{}] // Start with one empty row
          })
        }
      }
    } catch (error) {
      console.error(error)
      message.error('获取项目信息失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      // 1. Prepare pages
      const formPages = values.pages.map((p: any) => ({
        url: p.url,
        title: p.title || ''
      }))

      let allPages = []
      const existingPages = (project.urls || []).map((u: any) => 
        typeof u === 'string' ? { url: u, title: '' } : u
      )

      if (isEdit) {
        // Replace the item at editIndex
        const index = parseInt(editIndex!)
        allPages = [...existingPages]
        if (index >= 0 && index < allPages.length) {
          // We only allow editing one page at a time in edit mode
          allPages[index] = formPages[0]
        }
      } else {
        // Append new pages
        allPages = [...existingPages, ...formPages]
      }

      // 2. Update Config
      const newConfig = {
        ...project.default_config,
        device: values.devices,
        location: values.location,
        // Preserve authType logic from original code
        authType: 'custom', 
        cookies: values.cookies ? JSON.parse(values.cookies) : undefined,
        localStorage: values.localStorage ? JSON.parse(values.localStorage) : undefined,
        sessionStorage: values.sessionStorage ? JSON.parse(values.sessionStorage) : undefined
      }

      const updateData = {
        name: project.name,
        description: project.description,
        urls: allPages,
        config: newConfig
      }

      const res = await api.projects.update(id!, updateData)
      
      if (res.success) {
        message.success(isEdit ? '页面更新成功' : '页面添加成功')
        navigate(`/projects/${id}`)
      } else {
        message.error(res.error)
      }

    } catch (error: any) {
      console.error(error)
      message.error(error.message || '操作失败，请检查输入格式')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-[800px] mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${id}`)} />
          <Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑页面' : '添加页面'}</Title>
        </div>

        <Card>
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
             <Form.List name="pages">
                {(fields, { add, remove }) => (
                    <>
                        {fields.map(({ key, name, ...restField }) => (
                            <div key={key} className="mb-4 p-4 border border-gray-200 rounded relative bg-gray-50">
                                <Form.Item
                                    {...restField}
                                    name={[name, 'url']}
                                    label="URL"
                                    rules={[
                                      { required: true, message: '请输入URL' },
                                      {
                                        validator: async (_, value) => {
                                          if (!value) return Promise.resolve();

                                          // Check current form duplicates
                                          const formPages = form.getFieldValue('pages') || [];
                                          const duplicateInForm = formPages.filter((p: any) => p?.url === value).length > 1;
                                          if (duplicateInForm) {
                                            return Promise.reject(new Error('当前列表中存在重复的 URL'));
                                          }

                                          // Check project existing duplicates
                                          if (project && project.urls) {
                                            const existingUrls = project.urls.map((u: any) => typeof u === 'string' ? u : u.url);
                                            
                                            let isDuplicate = false;
                                            if (isEdit && editIndex !== null) {
                                                 const targetIndex = parseInt(editIndex);
                                                 // Check if it exists at any index other than targetIndex
                                                 isDuplicate = existingUrls.some((u: string, idx: number) => u === value && idx !== targetIndex);
                                            } else {
                                                 // Add mode: just check existence
                                                 isDuplicate = existingUrls.includes(value);
                                            }

                                            if (isDuplicate) {
                                              return Promise.reject(new Error('该 URL 已存在于项目中'));
                                            }
                                          }
                                          return Promise.resolve();
                                        }
                                      }
                                    ]}
                                    className="mb-2"
                                >
                                    <Input placeholder="https://example.com" />
                                </Form.Item>
                                <Form.Item
                                    {...restField}
                                    name={[name, 'title']}
                                    label="标题"
                                    className="mb-0"
                                >
                                    <Input placeholder="页面标题 (例如: 首页)" />
                                </Form.Item>
                                {!isEdit && fields.length > 1 && (
                                    <Button 
                                        type="text" 
                                        icon={<MinusCircleOutlined />} 
                                        onClick={() => remove(name)} 
                                        className="absolute top-2 right-2 text-red-500"
                                    />
                                )}
                            </div>
                        ))}
                        {!isEdit && (
                          <Form.Item>
                              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                  添加另一个 URL
                              </Button>
                          </Form.Item>
                        )}
                    </>
                )}
             </Form.List>

             <div className="grid grid-cols-2 gap-4">
                 <Form.Item name="devices" label="测试设备" rules={[{ required: true }]}>
                     <Select mode="multiple">
                         <Option value="mobile">手机端</Option>
                         <Option value="desktop">桌面端</Option>
                     </Select>
                 </Form.Item>
                 <Form.Item name="location" label="测试位置" rules={[{ required: true }]}>
                     <Select mode="multiple" placeholder="请选择测试位置">
                         <Option value="us-east">🇺🇸 美国东部 (弗吉尼亚北部)</Option>
                         <Option value="us-west">🇺🇸 美国西部 (俄勒冈)</Option>
                         <Option value="eu-west">🇪🇺 欧洲西部 (爱尔兰)</Option>
                         <Option value="ap-southeast">🇸🇬 亚太地区 (新加坡)</Option>
                         <Option value="cn-north">🇨🇳 中国 (北京)</Option>
                     </Select>
                 </Form.Item>
             </div>
             
             <Form.Item name="frequency" label="频率">
                 <Select>
                     <Option value="24h">每 24 小时</Option>
                     <Option value="12h">每 12 小时</Option>
                 </Select>
             </Form.Item>

             <Divider dashed>高级设置</Divider>
             <Form.Item name="cookies" label="Cookie (JSON 数组)">
                 <Input.TextArea rows={3} placeholder='[{"name": "session", "value": "..."}]' />
             </Form.Item>
             <Form.Item name="sessionStorage" label="SessionStorage (JSON 对象)">
                 <Input.TextArea rows={3} placeholder='{"key": "value"}' />
             </Form.Item>
             <Form.Item name="localStorage" label="LocalStorage (JSON 对象)">
                 <Input.TextArea rows={3} placeholder='{"key": "value"}' />
             </Form.Item>

             <Form.Item>
               <Button type="primary" htmlType="submit" loading={loading} block size="large">
                 {isEdit ? '保存修改' : '添加页面'}
               </Button>
             </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  )
}

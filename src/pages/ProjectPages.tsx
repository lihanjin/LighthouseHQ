import React, { useEffect, useState } from 'react'
import { Button, Typography, message, Spin, Checkbox, Modal, Form, Select, Progress, Tooltip, Input, Table, Tabs } from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import { 
  PlusOutlined, 
  SettingOutlined, 
  BarChartOutlined,
  DesktopOutlined,
  MobileOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  EditOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import dayjs from 'dayjs'
import ProjectSwitcher from '../components/ProjectSwitcher'

const { Text, Title } = Typography

// --- Configuration & Helpers ---

const METRIC_CONFIG = {
    good: {
        label: 'Good Core Web Vitals (CrUX)',
        unit: '%',
        ranges: [
            { label: '< 75%', color: 'bg-red-400', textColor: 'text-red-400', min: -Infinity, max: 75 },
            { label: '75% - 80%', color: 'bg-orange-400', textColor: 'text-orange-400', min: 75, max: 80 },
            { label: '> 80%', color: 'bg-green-400', textColor: 'text-green-400', min: 80, max: Infinity }
        ],
        getValue: (val: number) => val,
        format: (val: number) => val + '%',
        description: [
            "真实用户体验中，满足 Google 在三项核心网页指标（Core Web Vitals）上“优秀（Good）”阈值的占比。",
            "至少有 75% 的访问需达到“优秀”，才能获得最大的搜索排名加成。",
            "数据来自 Google 的 Chrome 用户体验报告（CrUX），并以最近 28 天的平均值计算。",
            "若需查看这三项指标的整体平均表现，请参考 Good Avg（CrUX）指标。"
        ]
    },
    fcp: {
        label: 'First Contentful Paint',
        unit: 's',
        ranges: [
            { label: '< 1.8 s', color: 'bg-green-400', textColor: 'text-green-400', min: -Infinity, max: 1800 },
            { label: '1.8 s - 3.0 s', color: 'bg-orange-400', textColor: 'text-orange-400', min: 1800, max: 3000 },
            { label: '> 3.0 s', color: 'bg-red-400', textColor: 'text-red-400', min: 3000, max: Infinity }
        ],
        getValue: (val: number) => val, // ms
        format: (val: number) => (val / 1000).toFixed(1) + ' s',
        description: [
            "FCP（首次内容绘制）衡量用户进入页面后，首个内容出现的速度。",
            "例如，文本与图片都被视为内容。"
        ]
    },
    lcp: {
        label: 'Largest Contentful Paint',
        unit: 's',
        ranges: [
            { label: '< 2.5 s', color: 'bg-green-400', textColor: 'text-green-400', min: -Infinity, max: 2500 },
            { label: '2.5 s - 4.0 s', color: 'bg-orange-400', textColor: 'text-orange-400', min: 2500, max: 4000 },
            { label: '> 4.0 s', color: 'bg-red-400', textColor: 'text-red-400', min: 4000, max: Infinity }
        ],
        getValue: (val: number) => val, // ms
        format: (val: number) => (val / 1000).toFixed(1) + ' s',
        description: [
            "LCP（最大内容绘制）衡量页面中最大可见元素出现的速度。",
            "该元素通常是首屏大图或大型标题。"
        ]
    },
    cls: {
        label: 'Cumulative Layout Shift',
        unit: '',
        ranges: [
            { label: '< 0.10', color: 'bg-green-400', textColor: 'text-green-400', min: -Infinity, max: 0.1 },
            { label: '0.10 - 0.30', color: 'bg-orange-400', textColor: 'text-orange-400', min: 0.1, max: 0.3 }, // Using 0.3 as per user image, standard is 0.25
            { label: '> 0.30', color: 'bg-red-400', textColor: 'text-red-400', min: 0.3, max: Infinity }
        ],
        getValue: (val: number) => val,
        format: (val: number) => val.toFixed(2),
        description: [
            "CLS（累计布局偏移）衡量页面布局的稳定性。",
            "若页面内容在渲染后发生位置跳动或偏移，即为布局不稳定。"
        ]
    },
    pageWeight: {
        label: 'Page Weight (Total)',
        unit: 'MB',
        ranges: [
            { label: '< 2 MB', color: 'bg-green-400', textColor: 'text-green-400', min: -Infinity, max: 2 * 1024 * 1024 },
            { label: '2 MB - 4 MB', color: 'bg-orange-400', textColor: 'text-orange-400', min: 2 * 1024 * 1024, max: 4 * 1024 * 1024 },
            { label: '> 4 MB', color: 'bg-red-400', textColor: 'text-red-400', min: 4 * 1024 * 1024, max: Infinity }
        ],
        getValue: (val: number) => val, // bytes
        format: (val: number) => (val / 1024 / 1024).toFixed(1) + ' MB',
        description: [
            "Page Weight（页面体量）衡量页面加载时需要下载的资源大小，例如图片或 JavaScript 文件。"
        ]
    }
}

type MetricType = keyof typeof METRIC_CONFIG

const getMetricColor = (type: MetricType, value: number) => {
    const config = METRIC_CONFIG[type]
    const range = config.ranges.find(r => value >= r.min && value < r.max)
    // For 'good' metric, higher is better (Green is last range). For others, lower is better (Green is first range).
    // The ranges logic handles this by mapping value ranges to colors directly.
    return range ? range.color : 'bg-gray-200'
}

const getMetricTextColor = (type: MetricType, value: number) => {
    const config = METRIC_CONFIG[type]
    const range = config.ranges.find(r => value >= r.min && value < r.max)
    return range ? range.textColor : 'text-gray-400'
}

// --- Components ---

interface MetricCellProps {
    type: MetricType;
    history: { value: number, date: string }[];
    currentValue: number | null;
    currentDate: string | null;
}

const MetricCell = ({ type, history, currentValue, currentDate }: MetricCellProps) => {
    const config = METRIC_CONFIG[type]
    
    // Fill history to 10 slots if needed, or just show what we have
    // We want to show a sparkline. If history is empty, show empty slots?
    // User images show populated bars.
    
    // Reverse history to show oldest -> newest (left -> right)
    // The prop history is expected to be [newest, ..., oldest] or similar?
    // Let's assume passed history is already sorted Oldest -> Newest for rendering
    const displayHistory = history.slice(-10) 
    
    const TooltipContent = () => (
        <div className="flex flex-col gap-2 min-w-[200px] p-1">
            <div className="text-xs text-gray-500">{config.label}</div>
            <div className="text-xl font-bold text-gray-800">
                {currentValue !== null ? config.format(currentValue) : 'No data'}
            </div>
            <div className="text-xs text-gray-400 mb-2">
                {currentDate ? dayjs(currentDate).format('D MMM') : '-'}
            </div>
            
            {/* Description from config */}
            {config.description && config.description.length > 0 && (
                <div className="mb-2 text-xs text-gray-600 space-y-1">
                    {config.description.map((line, i) => (
                        <p key={i} className="m-0">{line}</p>
                    ))}
                </div>
            )}
            
            <div className="h-px bg-gray-100 w-full mb-2"></div>
            
            <div className="flex justify-between gap-2 text-[10px] text-gray-500">
                {config.ranges.map((range, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${range.color.replace('bg-', 'text-').replace('400', '500')}`}>●</div>
                        <span>{range.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )

    return (
        <Tooltip title={<TooltipContent />} color="white" overlayInnerStyle={{ color: 'black', padding: '12px' }} placement="top">
            <div className="flex flex-col w-full max-w-[140px] cursor-pointer group">
                {/* Sparkline */}
                <div className="flex gap-1 mb-1 h-8 items-end">
                    {/* Render up to 10 bars */}
                    {Array.from({ length: 10 }).map((_, i) => {
                        // Map visual index to history index
                        // We align right.
                        const historyIndex = displayHistory.length - (10 - i)
                        const dataPoint = historyIndex >= 0 ? displayHistory[historyIndex] : null
                        
                        const isCurrent = i === 9 // Last bar
                        const color = dataPoint ? (isCurrent ? getMetricColor(type, dataPoint.value) : 'bg-gray-200') : 'bg-gray-50'
                        
                        // Calculate height based on relative value? Or just full height?
                        // Images show full height bars.
                        const height = '100%' 
                        
                        return (
                            <div 
                                key={i} 
                                className={`flex-1 rounded-sm ${color} transition-colors`}
                                style={{ height }}
                            />
                        )
                    })}
                </div>
                {/* Value Text */}
                <div className="flex justify-between items-center">
                    <Text strong className={`text-lg ${currentValue !== null ? getMetricTextColor(type, currentValue) : 'text-gray-300'}`}>
                         {currentValue !== null ? config.format(currentValue) : '-'}
                    </Text>
                </div>
            </div>
        </Tooltip>
    )
}

const HeaderWithTooltip = ({ title, metricKey }: { title: string, metricKey: MetricType }) => {
    const config = METRIC_CONFIG[metricKey]
    
    const TooltipContent = () => (
        <div className="flex flex-col gap-2 min-w-[200px] p-1">
             <div className="text-xs text-gray-500">{config.label}</div>
             {config.description && config.description.length > 0 && (
                <div className="mb-2 text-xs text-gray-600 space-y-1">
                    {config.description.map((line, i) => (
                        <p key={i} className="m-0">{line}</p>
                    ))}
                </div>
            )}
        </div>
    )

    return (
        <div className="flex items-center gap-1 cursor-help">
            <span>{title}</span>
            <Tooltip title={<TooltipContent />} color="white" overlayInnerStyle={{ color: 'black', padding: '12px' }}>
                <QuestionCircleOutlined className="text-blue-400" />
            </Tooltip>
        </div>
    )
}

// --- Storage Editor Component ---

interface StorageItem {
    key: string;
    value: string;
    id: string; // for internal key
}

const StorageEditor = ({ value = [], onChange }: { value?: StorageItem[], onChange?: (val: StorageItem[]) => void }) => {
    const [items, setItems] = useState<StorageItem[]>(value)

    useEffect(() => {
        setItems(value)
    }, [value])

    const handleAdd = () => {
        const newData = [...items, { key: '', value: '', id: Date.now().toString() }]
        setItems(newData)
        onChange?.(newData)
    }

    const handleDelete = (id: string) => {
        const newData = items.filter(item => item.id !== id)
        setItems(newData)
        onChange?.(newData)
    }

    const handleChange = (id: string, field: 'key' | 'value', val: string) => {
        const newData = items.map(item => item.id === id ? { ...item, [field]: val } : item)
        setItems(newData)
        onChange?.(newData)
    }

    const columns = [
        {
            title: 'Key',
            dataIndex: 'key',
            key: 'key',
            render: (text: string, record: StorageItem) => (
                <Input 
                    value={text} 
                    onChange={e => handleChange(record.id, 'key', e.target.value)} 
                    placeholder="Key / Name"
                />
            )
        },
        {
            title: 'Value',
            dataIndex: 'value',
            key: 'value',
            render: (text: string, record: StorageItem) => (
                <Input 
                    value={text} 
                    onChange={e => handleChange(record.id, 'value', e.target.value)} 
                    placeholder="Value"
                />
            )
        },
        {
            title: 'Action',
            key: 'action',
            width: 80,
            render: (_: unknown, record: StorageItem) => (
                <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleDelete(record.id)} 
                />
            )
        }
    ]

    return (
        <div className="space-y-2">
            <Table 
                dataSource={items} 
                columns={columns} 
                rowKey="id" 
                pagination={false} 
                size="small"
                bordered
            />
            <Button type="dashed" onClick={handleAdd} block icon={<PlusOutlined />}>
                Add Item
            </Button>
        </div>
    )
}

// --- Main Page ---

interface PageMetrics {
    id: string;
    urlIndex: number;
    url: string;
    title: string;
    device: string;
    location: string;
    metrics: {
        good: { value: number | null, history: any[] };
        fcp: { value: number | null, history: any[] };
        lcp: { value: number | null, history: any[] };
        cls: { value: number | null, history: any[] };
        pageWeight: { value: number | null, history: any[] };
        screenshot: string | null;
        date: string | null;
    };
    screenshot: string | null;
}

export default function ProjectPages() {
  const { id } = useParams()
  const navigate = useNavigate()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  
  // Batch Edit Modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [form] = Form.useForm()

  // Settings Modal
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false)
  const [settingsForm] = Form.useForm()

  useEffect(() => {
    fetchProject()
    const interval = setInterval(() => fetchProject(false), 5000)
    return () => clearInterval(interval)
  }, [id])

  const fetchProject = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await api.projects.get(id!)
      if (res.success) {
        setProject(res.data)
        setRunning(!!res.data.runningTask)
        
        // Initialize settings form with current config
        const config = res.data.default_config || {}
        
        // Helper to transform array to StorageItem format if needed, or init empty
        // Assuming backend stores as array of objects: [{name/key, value}, ...]
        // We map to {id, key, value} for the editor
        
        const transform = (arr: any[], keyField: string = 'key') => 
            Array.isArray(arr) ? arr.map((item, idx) => ({ 
                id: Date.now() + idx + Math.random().toString(), 
                key: item[keyField] || item.name, 
                value: item.value 
            })) : []

        settingsForm.setFieldsValue({
            cookies: transform(config.cookies, 'name'),
            localStorage: transform(config.localStorage, 'key'),
            sessionStorage: transform(config.sessionStorage, 'key')
        })
      }
    } catch (error) {
      console.error(error)
      if (showLoading) message.error('获取项目失败')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const handleRunNow = async () => {
    if (!project) return
    setRunning(true)
    try {
        const res = await api.tasks.create({
            projectId: project.id,
            urls: project.urls,
            device: project.default_config?.device || ['desktop'],
            location: project.default_config?.location || 'us-east',
            network: 'fast4g',
            authType: project.default_config?.authType || 'none',
            authData: project.default_config,
        })
        if (res.success) {
            message.success('任务已开始执行')
            fetchProject(false)
        } else {
            message.error(res.error)
            setRunning(false)
        }
    } catch (error) {
        console.error(error)
        message.error('执行失败')
        setRunning(false)
    }
  }

  const handleStop = async () => {
    if (!project?.runningTask) return
    try {
        const res = await api.tasks.cancel(project.runningTask.id)
        if (res.success) {
            message.success('已请求终止任务')
            fetchProject(false)
        } else {
            message.error(res.error)
        }
    } catch (error) {
        console.error(error)
        message.error('终止失败')
    }
  }

  const handleSettingsSave = async () => {
      try {
          const values = await settingsForm.validateFields()
          
          // Transform back to backend format
          // Cookies: name, value
          // Storage: key, value
          const cookies = values.cookies?.map((item: any) => ({ name: item.key, value: item.value })) || []
          const localStorage = values.localStorage?.map((item: any) => ({ key: item.key, value: item.value })) || []
          const sessionStorage = values.sessionStorage?.map((item: any) => ({ key: item.key, value: item.value })) || []

          const newConfig = {
              ...project.default_config,
              cookies,
              localStorage,
              sessionStorage
          }

          const res = await api.projects.update(project.id, {
              ...project,
              default_config: newConfig
          })

          if (res.success) {
              message.success('配置已保存')
              setProject(res.data)
              setIsSettingsModalVisible(false)
          } else {
              message.error(res.error)
          }

      } catch (error) {
          console.error(error)
          message.error('保存失败')
      }
  }

  // --- Data Processing ---

  const pages: PageMetrics[] = []
  
  const rawDevices = project?.default_config?.device || ['desktop']
  const devices = Array.isArray(rawDevices) ? rawDevices : [rawDevices]
  const urls = project?.urls || []
  const latestReports = project?.latestReports || []
  const reportsHistory = project?.reportsHistory || {}

  const getMetrics = (url: string, device: string, location: string) => {
    const key = `${url}-${device}-${location}`
    const report = latestReports.find((r: any) => r.url === url && r.device === device && r.location === location)
    const history = reportsHistory[key] || []
    
    // Sort history Oldest -> Newest
    const sortedHistory = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // Extract values
    const extractHistory = (field: string) => sortedHistory.map(r => ({
        value: Number(r[field]),
        date: r.created_at
    }))
    
    // Good (Performance Score)
    const goodHistory = sortedHistory.map(r => ({ value: r.performance_score, date: r.created_at }))
    
    return {
        good: { 
            value: report ? report.performance_score : null, 
            history: goodHistory 
        },
        fcp: { 
            value: report ? report.fcp : null, 
            history: extractHistory('fcp') 
        },
        lcp: { 
            value: report ? report.lcp : null, 
            history: extractHistory('lcp') 
        },
        cls: { 
            value: report ? report.cls : null, 
            history: extractHistory('cls') 
        },
        pageWeight: { 
            value: report ? report.total_byte_weight : null, 
            history: extractHistory('total_byte_weight') 
        },
        screenshot: report?.screenshot || null,
        date: report?.created_at || null
    }
  }

  const getLocationName = (val: string) => {
      const map: Record<string, string> = {
          'us-east': '美国东部',
          'us-west': '美国西部',
          'eu-west': '欧洲西部',
          'ap-southeast': '亚太地区',
          'cn-north': '中国 (北京)'
      }
      return map[val] || val
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  urls.forEach((urlItem: any, urlIndex: number) => {
    const url = typeof urlItem === 'string' ? urlItem : urlItem.url
    const title = typeof urlItem === 'string' ? '' : (urlItem.title || '')
    const itemConfig = typeof urlItem === 'string' ? {} : urlItem
    
    const itemDevices = itemConfig.device || devices
    const currentDevices = Array.isArray(itemDevices) ? itemDevices : [itemDevices]
    const itemLocations = itemConfig.location || project?.default_config?.location || 'us-east'
    const currentLocations = Array.isArray(itemLocations) ? itemLocations : [itemLocations]

    currentLocations.forEach((location: string) => {
        currentDevices.forEach((device: string) => {
            const metrics = getMetrics(url, device, location)
            pages.push({
                id: `${url}-${device}-${location}`,
                urlIndex, url, title, device, location, metrics,
                screenshot: metrics.screenshot
            })
        })
    })
  })

  // Batch Operations
  const handleSelectAll = (e: CheckboxChangeEvent) => {
      setSelectedRowKeys(e.target.checked ? pages.map(p => p.id) : [])
  }

  const handleSelectRow = (id: string, checked: boolean) => {
      setSelectedRowKeys(checked ? [...selectedRowKeys, id] : selectedRowKeys.filter(k => k !== id))
  }

  const handleDelete = async (urlToDelete?: string) => {
      const selectedPages = urlToDelete 
        ? pages.filter(p => p.url === urlToDelete)
        : pages.filter(p => selectedRowKeys.includes(p.id))
      
      const urlsToDelete = [...new Set(selectedPages.map(p => p.url))]
      
      if (urlsToDelete.length === 0) return

      Modal.confirm({
          title: '确认删除',
          content: `确定要删除这 ${urlsToDelete.length} 个页面吗？`,
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const newUrls = project.urls.filter((u: any) => {
                  const urlStr = typeof u === 'string' ? u : u.url
                  return !urlsToDelete.includes(urlStr)
              })
              const res = await api.projects.update(id!, { ...project, urls: newUrls })
              if (res.success) {
                  message.success('删除成功')
                  setProject(res.data)
                  setSelectedRowKeys([])
              } else {
                  message.error(res.error)
              }
          }
      })
  }
  
  const handleBatchEdit = () => {
    if (selectedRowKeys.length > 0) setIsEditModalVisible(true)
  }

  const submitBatchEdit = async () => {
      setIsEditModalVisible(false)
      message.success('Updated (Mock)')
  }
  
  const handleAddPage = () => navigate(`/projects/${id}/pages/add`)
  const handleEditPage = (index: number) => navigate(`/projects/${id}/pages/edit?index=${index}`)

  return (
    <div className="min-h-screen bg-white">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <div className="flex items-center gap-4">
            <ProjectSwitcher />
            <Button 
                type="primary" 
                icon={<PlayCircleOutlined />} 
                loading={running}
                onClick={handleRunNow}
                disabled={!project || running}
            >
                {running ? '执行中...' : '立即执行'}
            </Button>
            {running && <Button danger onClick={handleStop}>停止</Button>}
            {project?.runningTask && (
                <div className="flex items-center gap-2 w-64">
                    <Progress percent={project.runningTask.progress} size="small" status="active" />
                </div>
            )}
        </div>
        <div className="flex items-center gap-6">
            <Button icon={<SettingOutlined />} size="small" type="text" onClick={() => setIsSettingsModalVisible(true)} />
        </div>
      </div>

      <div className="p-6">
        {selectedRowKeys.length > 0 && (
            <div className="mb-4 flex items-center gap-3 p-2 bg-blue-50 border border-blue-100 rounded text-blue-700">
                <span>已选择 {selectedRowKeys.length} 项</span>
                <Button size="small" type="link" onClick={() => handleDelete()}>批量删除</Button>
                <Button size="small" type="link" onClick={handleBatchEdit}>批量编辑</Button>
                <div className="flex-1"></div>
                <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => setSelectedRowKeys([])} />
            </div>
        )}

        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100 mb-2 items-center">
            <div className="col-span-4 flex items-center gap-3">
                <Checkbox 
                    checked={pages.length > 0 && selectedRowKeys.length === pages.length}
                    indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < pages.length}
                    onChange={handleSelectAll}
                />
                <span>页面</span>
            </div>
            <div className="col-span-8 grid grid-cols-5 gap-4">
                <HeaderWithTooltip title="GOOD (CRUX)" metricKey="good" />
                <HeaderWithTooltip title="FCP" metricKey="fcp" />
                <HeaderWithTooltip title="LCP" metricKey="lcp" />
                <HeaderWithTooltip title="CLS" metricKey="cls" />
                <HeaderWithTooltip title="PAGE WEIGHT" metricKey="pageWeight" />
            </div>
        </div>

        <div className="space-y-1">
            {loading ? (
                 <div className="py-12 flex justify-center items-center">
                     <Spin size="large" />
                 </div>
            ) : (
                pages.map((page) => (
                    <div key={page.id} className={`grid grid-cols-12 gap-4 px-4 py-3 bg-white border rounded hover:shadow-sm transition-shadow items-center ${selectedRowKeys.includes(page.id) ? 'border-blue-200 bg-blue-50/20' : 'border-gray-100'}`}>
                        <div className="col-span-4 flex items-start gap-4">
                            <div className="pt-8">
                                <Checkbox 
                                    checked={selectedRowKeys.includes(page.id)}
                                    onChange={(e) => handleSelectRow(page.id, e.target.checked)}
                                />
                            </div>
                            <div 
                                className="bg-gray-50 rounded border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden relative"
                                style={{
                                    width: page.device === 'mobile' ? '56px' : '128px',
                                    height: page.device === 'mobile' ? '100px' : '80px',
                                    boxShadow: '0 0 5px #c7c7c7'
                                }}
                            >
                                {page.screenshot ? (
                                    <img src={page.screenshot} alt="Screenshot" className="w-full h-full object-cover" />
                                ) : (
                                    page.device === 'mobile' ? <MobileOutlined className="text-gray-300 text-xl" /> : <DesktopOutlined className="text-gray-300 text-xl" />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Text strong className="text-base text-gray-800 truncate" title={page.title || page.url}>
                                        {page.title ? `${page.title}` : page.url.replace(/^https?:\/\//, '').split('/')[0]}
                                    </Text>
                                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditPage(page.urlIndex)} />
                                    <Tooltip title="删除页面">
                                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(page.url)} />
                                    </Tooltip>
                                </div>
                                <div className="mb-2 truncate">
                                    <a href={page.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-sm">
                                        {page.url}
                                    </a>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <span className="flex items-center gap-1">
                                        {page.device === 'mobile' ? <MobileOutlined /> : <DesktopOutlined />}
                                        {page.device === 'mobile' ? '移动端' : '桌面端'}
                                    </span>
                                    <span>|</span>
                                    <span className="flex items-center gap-1"><GlobalOutlined /> {getLocationName(page.location)}</span>
                                    <span>|</span>
                                    <span className="flex items-center gap-1"><ClockCircleOutlined /> 24h</span>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-8 grid grid-cols-5 gap-4">
                            <MetricCell type="good" history={page.metrics.good.history} currentValue={page.metrics.good.value} currentDate={page.metrics.date} />
                            <MetricCell type="fcp" history={page.metrics.fcp.history} currentValue={page.metrics.fcp.value} currentDate={page.metrics.date} />
                            <MetricCell type="lcp" history={page.metrics.lcp.history} currentValue={page.metrics.lcp.value} currentDate={page.metrics.date} />
                            <MetricCell type="cls" history={page.metrics.cls.history} currentValue={page.metrics.cls.value} currentDate={page.metrics.date} />
                            <MetricCell type="pageWeight" history={page.metrics.pageWeight.history} currentValue={page.metrics.pageWeight.value} currentDate={page.metrics.date} />
                        </div>
                    </div>
                ))
            )}
        </div>

        <div className="flex justify-between items-center mt-8">
            <Button type="primary" icon={<PlusOutlined />} size="large" className="bg-[#0052CC]" onClick={handleAddPage}>
                添加页面
            </Button>
        </div>
      </div>
      
      {/* Batch Edit Modal */}
      <Modal title="批量编辑" open={isEditModalVisible} onOk={submitBatchEdit} onCancel={() => setIsEditModalVisible(false)}>
          <Form form={form} layout="vertical">
              <Form.Item name="device" label="设备类型">
                  <Select mode="multiple">
                      <Select.Option value="desktop">Desktop</Select.Option>
                      <Select.Option value="mobile">Mobile</Select.Option>
                  </Select>
              </Form.Item>
          </Form>
      </Modal>

      {/* Settings Modal */}
      <Modal 
          title="项目配置 (Global Settings)" 
          open={isSettingsModalVisible} 
          onOk={handleSettingsSave} 
          onCancel={() => setIsSettingsModalVisible(false)}
          width={700}
      >
          <Form form={settingsForm} layout="vertical">
              <Tabs defaultActiveKey="cookies" items={[
                  {
                      key: 'cookies',
                      label: 'Cookies',
                      children: (
                          <Form.Item name="cookies" noStyle>
                              <StorageEditor />
                          </Form.Item>
                      )
                  },
                  {
                      key: 'localStorage',
                      label: 'LocalStorage',
                      children: (
                          <Form.Item name="localStorage" noStyle>
                              <StorageEditor />
                          </Form.Item>
                      )
                  },
                  {
                      key: 'sessionStorage',
                      label: 'SessionStorage',
                      children: (
                          <Form.Item name="sessionStorage" noStyle>
                              <StorageEditor />
                          </Form.Item>
                      )
                  }
              ]} />
          </Form>
      </Modal>
    </div>
  )
}

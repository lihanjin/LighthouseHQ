import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Typography, Tabs, Spin, Button, Space, Tag, Row, Col, Result, Collapse, Tooltip } from 'antd'
import { ArrowLeftOutlined, DesktopOutlined, MobileOutlined, GlobalOutlined, ClockCircleOutlined, ExportOutlined, InfoCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { api, API_BASE_URL } from '@/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

// --- Helper Components ---

const VideoPlayer = ({ thumbnails }: { thumbnails: any[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % thumbnails.length)
      }, 500) // Play at 2fps
    }
    return () => clearInterval(timer)
  }, [isPlaying, thumbnails.length])

  if (thumbnails.length === 0) return null

  const currentFrame = thumbnails[currentIndex]

  return (
    <Card 
      title="视频录制 (Video Recording)" 
      size="small" 
      className="shadow-sm border-gray-100 h-full flex flex-col"
      extra={<Button size="small" type="text">导出 <ExportOutlined /></Button>}
    >
      <div className="flex-1 flex flex-col items-center bg-gray-50 rounded p-4 relative min-h-[360px] justify-center">
        <div className="relative shadow-lg border border-gray-200 bg-white leading-[0]">
          <img 
            src={currentFrame.data} 
            className="max-h-[300px] w-auto transition-opacity duration-200" 
            alt="Video frame" 
          />
          {!isPlaying && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black/5 cursor-pointer group"
              onClick={() => setIsPlaying(true)}
            >
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <PlayCircleOutlined className="text-2xl text-blue-600" />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Controls */}
      <div className="mt-4 space-y-3">
        <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden relative cursor-pointer group">
          <div 
            className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(currentIndex / (thumbnails.length - 1)) * 100}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Button 
            type="text" 
            shape="circle" 
            icon={isPlaying ? <div className="w-3 h-3 bg-blue-600 rounded-sm mx-auto" /> : <PlayCircleOutlined className="text-blue-600" />} 
            onClick={() => setIsPlaying(!isPlaying)}
          />
          
          <Space className="text-gray-400 text-xs">
            <Button size="small" type="text" disabled={currentIndex === 0} onClick={() => setCurrentIndex(v => v - 1)}>上一帧</Button>
            <span className="text-gray-800 font-mono font-bold w-16 text-center">
              {(currentFrame.timing / 1000).toFixed(2)} s
            </span>
            <Button size="small" type="text" disabled={currentIndex === thumbnails.length - 1} onClick={() => setCurrentIndex(v => v + 1)}>下一帧</Button>
          </Space>
          
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
             <ClockCircleOutlined /> x1.00
          </div>
        </div>
      </div>
    </Card>
  )
}

const LcpElementPanel = ({ lhr, screenshot }: any) => {
  const lcpAudit = lhr.audits['largest-contentful-paint-element']
  const item = lcpAudit?.details?.items?.[0]
  
  if (!item) return <Card title="LCP 关键元素" size="small" className="h-full shadow-sm border-gray-100"><Text type="secondary">未识别到 LCP 元素</Text></Card>

  return (
    <Card title="最大内容绘制元素 (LCP Element)" size="small" className="shadow-sm border-gray-100 h-full flex flex-col overflow-hidden">
      <div className="flex-1 bg-gray-50 flex items-center justify-center p-4 min-h-[300px]">
        {screenshot ? (
          <div className="relative border border-gray-200 shadow-md bg-white">
            <img src={screenshot} alt="LCP Screenshot" className="max-h-[260px] w-auto" />
            {/* Red highlight box - heuristic positioning based on LHR if available, or just indicator */}
            <div className="absolute inset-0 border-2 border-red-500 bg-red-500/10 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.1)] clip-path-safe" />
          </div>
        ) : (
          <Text type="secondary">无快照</Text>
        )}
      </div>
      
      <div className="border-t border-gray-100">
        <div className="grid grid-cols-4 border-b border-gray-50">
          <div className="col-span-1 p-3 bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase">名称 (Title)</div>
          <div className="col-span-3 p-3 text-xs text-gray-700 font-medium truncate">{item.node.nodeLabel}</div>
        </div>
        <div className="grid grid-cols-4">
          <div className="col-span-1 p-3 bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase">代码 (Snippet)</div>
          <div className="col-span-3 p-3">
            <code className="text-[10px] text-pink-600 bg-pink-50 px-1 py-0.5 rounded break-all line-clamp-2">
              {item.node.snippet}
            </code>
          </div>
        </div>
      </div>
    </Card>
  )
}

const MetricCard = ({ label, value, unit, format, status, info }: any) => {
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'success': return '#52c41a';
      case 'warning': return '#faad14';
      case 'error': return '#ff4d4f';
      default: return '#d9d9d9';
    }
  }

  return (
    <Card 
      className="shadow-sm border-gray-100 h-full relative overflow-hidden" 
      size="small"
      styles={{ body: { padding: '16px 12px' } }}
    >
      <div 
        className="absolute top-0 left-0 right-0 h-1" 
        style={{ backgroundColor: getStatusColor(status) }}
      />
      <div className="flex justify-between items-start mb-2">
        <Text type="secondary" className="text-xs font-medium uppercase tracking-wider">{label}</Text>
        {info && (
          <Tooltip title={info}>
            <InfoCircleOutlined className="text-gray-300 text-xs cursor-help" />
          </Tooltip>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-800">
          {value !== null ? format(value).split(' ')[0] : '-'}
        </span>
        <span className="text-xs text-gray-400 font-medium">
          {value !== null ? format(value).split(' ')[1] || unit : ''}
        </span>
      </div>
    </Card>
  )
}

const Filmstrip = ({ lhr, metrics }: any) => {
  const thumbnails = lhr?.audits?.['screenshot-thumbnails']?.details?.items || []
  if (thumbnails.length === 0) return <Text type="secondary">无渲染数据</Text>

  const maxTiming = Math.max(...thumbnails.map((t: any) => t.timing), metrics.lcp || 0, metrics.fcp || 0, 3000)
  const duration = Math.ceil(maxTiming / 1000) * 1000 
  
  const steps = []
  for (let i = 0; i <= duration; i += 500) {
    steps.push(i)
  }

  const events = [
    { label: 'Full TTFB', value: metrics.ttfb, color: '#52c41a', key: 'ttfb' },
    { label: 'First Contentful Paint', value: metrics.fcp, color: '#722ed1', key: 'fcp' },
    { label: 'Largest Contentful Paint', value: metrics.lcp, color: '#f5222d', key: 'lcp' },
    { label: 'Visually Complete', value: metrics.visuallyComplete || (thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].timing : 0), color: '#1890ff', key: 'vc' }
  ].filter(e => e.value !== null && e.value > 0).sort((a, b) => a.value - b.value)

  // Find frames that are closest to key events
  const findClosestFrameIndex = (val: number) => {
    let closest = 0;
    let minDiff = Infinity;
    thumbnails.forEach((t: any, i: number) => {
      const diff = Math.abs(t.timing - val);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    });
    return closest;
  };

  const lcpFrameIndex = findClosestFrameIndex(metrics.lcp);

  return (
    <Card 
      title="渲染胶片 (Rendering Filmstrip)" 
      className="shadow-sm border-gray-100 overflow-hidden" 
      size="small"
      extra={
        <div className="flex items-center gap-4 text-xs">
          <Tooltip title="关键指标说明">
            <InfoCircleOutlined className="text-orange-400" />
          </Tooltip>
          <div className="flex items-center gap-3 bg-gray-50 px-2 py-1 rounded border border-gray-100 text-gray-400">
            <span>FCP <Text strong className="text-gray-400">{(metrics.fcp / 1000).toFixed(1)}s</Text></span>
            <span>LCP <Text strong className="text-gray-400">{(metrics.lcp / 1000).toFixed(1)}s</Text></span>
          </div>
        </div>
      }
    >
      <div className="relative pt-12 pb-28 px-4 overflow-x-auto bg-white">
        {/* Background Vertical Grid Lines */}
        <div className="absolute inset-0 top-12 bottom-28 pointer-events-none min-w-[800px]">
          {steps.map((ms) => (
            <div 
              key={`grid-${ms}`} 
              className="absolute h-full w-px bg-gray-50" 
              style={{ left: `${(ms / duration) * 100}%` }}
            />
          ))}
        </div>

        {/* Timeline Frames */}
        <div className="relative h-40 mb-4 min-w-[800px]">
          {thumbnails.map((item: any, i: number) => {
            const isLCP = i === lcpFrameIndex;
            return (
              <div 
                key={i} 
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${(item.timing / duration) * 100}%`, transform: 'translateX(-50%)', zIndex: isLCP ? 30 : 10 }}
              >
                <div className="relative group">
                  {isLCP && (
                    <div className="absolute -top-8 left-0 right-0 bg-black text-white text-[10px] px-1 py-0.5 rounded-sm flex justify-between items-center z-40">
                      <span>{(item.timing / 1000).toFixed(1)}s</span>
                      <span className="font-bold ml-2">LCP</span>
                    </div>
                  )}
                  <img 
                    src={item.data} 
                    alt={`frame-${i}`} 
                    className={`h-32 border ${isLCP ? 'border-red-400 border-2 shadow-md' : 'border-gray-200'} rounded-sm shadow-sm hover:border-blue-400 hover:scale-105 transition-all bg-white`} 
                  />
                  <div className="absolute -bottom-5 text-[9px] text-gray-300 whitespace-nowrap">{(item.timing / 1000).toFixed(1)}s</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Axis line */}
        <div className="relative h-px bg-gray-200 mt-16 min-w-[800px]">
          {/* Vertical Scale Ticks */}
          {steps.map((ms) => (
            <div 
              key={ms} 
              className="absolute" 
              style={{ left: `${(ms / duration) * 100}%` }}
            >
              <div className="h-2 w-px bg-gray-300 absolute -top-1" />
              <div className="text-[10px] text-gray-400 absolute top-2 transform -translate-x-1/2">
                {(ms / 1000).toFixed(1)}s
              </div>
            </div>
          ))}

          {/* Event Markers & Hanging Labels */}
          {events.map((ev, i) => {
            const left = (ev.value / duration) * 100
            const staggerLevel = i % 3; // Stagger labels vertically
            return (
              <div 
                key={ev.key}
                className="absolute"
                style={{ left: `${left}%`, zIndex: 20 }}
              >
                {/* Marker dot on the axis */}
                <div className="absolute top-[-4px] left-[-4px] w-2 h-2 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: ev.color }} />
                
                {/* Hanging Label with leader line */}
                <div 
                  className="absolute left-0 flex flex-col items-center"
                  style={{ top: `${16 + staggerLevel * 24}px`, transform: 'translateX(-50%)' }}
                >
                  <div className="w-px h-4 bg-gray-200" />
                  <div 
                    className="whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold shadow-sm border bg-white"
                    style={{ color: ev.color, borderColor: ev.color }}
                  >
                    {ev.label}: {(ev.value / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

export default function ReportDetail() {
  const { reportId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reportData, setReportData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchReport()
  }, [reportId])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const res = await api.projects.getReportJson(reportId!)
      if (res.success) {
        setReportData(res.data)
      } else {
        setError(res.error || '加载报告失败')
      }
    } catch (err) {
      setError('获取报告数据时出错')
    } finally {
      setLoading(false)
    }
  }

  // Calculate TTFB (B口径)
  const metrics = useMemo(() => {
    if (!reportData?.lighthouse_data) return {}
    const lhr = reportData.lighthouse_data
    const requests = lhr.audits['network-requests']?.details?.items || []
    const mainDoc = requests.find((r: any) => r.resourceType === 'document')
    
    return {
      ttfb: mainDoc ? mainDoc.timing.receiveHeadersEnd : (lhr.audits['server-response-time']?.numericValue || 0),
      fcp: lhr.audits['first-contentful-paint']?.numericValue || 0,
      lcp: lhr.audits['largest-contentful-paint']?.numericValue || 0,
      tbt: lhr.audits['total-blocking-time']?.numericValue || 0,
      cls: lhr.audits['cumulative-layout-shift']?.numericValue || 0,
      pageWeight: lhr.audits['total-byte-weight']?.numericValue || 0,
      visuallyComplete: lhr.audits['speed-index']?.numericValue || 0,
    }
  }, [reportData])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Spin size="large" />
        <Text className="mt-4 text-gray-400">正在解析 Lighthouse 数据...</Text>
      </div>
    )
  }

  if (error || !reportData) {
    return <Result status="error" title="无法加载报告" subTitle={error} extra={<Button onClick={() => navigate(-1)}>返回</Button>} />
  }

  const { lighthouse_data: lhr } = reportData
  const performanceScore = Math.round((lhr?.categories?.performance?.score || 0) * 100)

  const getStatus = (val: number, type: string) => {
    // 同步阈值
    if (type === 'score') return val >= 90 ? 'success' : val >= 50 ? 'warning' : 'error';
    
    switch (type) {
      case 'ttfb': return val < 400 ? 'success' : val < 800 ? 'warning' : 'error';
      case 'fcp': return val < 1800 ? 'success' : val < 3000 ? 'warning' : 'error';
      case 'lcp': return val < 2500 ? 'success' : val < 4000 ? 'warning' : 'error';
      case 'tbt': return val < 200 ? 'success' : val < 600 ? 'warning' : 'error';
      case 'cls': return val < 0.1 ? 'success' : val < 0.3 ? 'warning' : 'error';
      default: return 'none';
    }
  }

  const items = [
    {
      key: 'overview',
      label: '概览',
      children: (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Top Info Bar */}
          <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <Space direction="vertical" size={0}>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  {reportData.device === 'mobile' ? <MobileOutlined /> : <DesktopOutlined />}
                  {reportData.device === 'mobile' ? '移动端' : '桌面端'}
                </span>
                <span>|</span>
                <span>{reportData.location}</span>
                <span>|</span>
                <span>{dayjs(reportData.created_at).format('YYYY-MM-DD HH:mm:ss')}</span>
                <span>|</span>
                <span className="bg-gray-100 px-1 rounded text-[10px] text-gray-500 uppercase font-medium text-nowrap">Lighthouse {lhr.lighthouseVersion}</span>
              </div>
              <Title level={4} className="m-0 mt-1 truncate max-w-xl">{reportData.url}</Title>
            </Space>
            
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter mb-1">性能评分</div>
                <div 
                  className="text-3xl font-black rounded-full w-16 h-16 flex items-center justify-center border-4"
                  style={{ 
                    borderColor: getStatus(performanceScore, 'score') === 'success' ? '#52c41a' : getStatus(performanceScore, 'score') === 'warning' ? '#faad14' : '#ff4d4f',
                    color: getStatus(performanceScore, 'score') === 'success' ? '#52c41a' : getStatus(performanceScore, 'score') === 'warning' ? '#faad14' : '#ff4d4f'
                  }}
                >
                  {performanceScore}
                </div>
              </div>
              <Button icon={<ExportOutlined />} onClick={() => window.open(reportData.url, '_blank')}>访问页面</Button>
            </div>
          </div>

          {/* 2x3 Metric Grid */}
          <Row gutter={[16, 16]}>
            <Col span={8}><MetricCard label="TTFB (首字节时间)" value={metrics.ttfb} unit="ms" format={(v: any) => `${Math.round(v)} ms`} status={getStatus(metrics.ttfb, 'ttfb')} info="TTFB 衡量浏览器接收到服务器响应的首个字节所需的时间。" /></Col>
            <Col span={8}><MetricCard label="FCP (首次内容绘制)" value={metrics.fcp} unit="s" format={(v: any) => `${(v/1000).toFixed(2)} s`} status={getStatus(metrics.fcp, 'fcp')} info="FCP 衡量页面渲染出首个文本或图像的时间。" /></Col>
            <Col span={8}><MetricCard label="LCP (最大内容绘制)" value={metrics.lcp} unit="s" format={(v: any) => `${(v/1000).toFixed(2)} s`} status={getStatus(metrics.lcp, 'lcp')} info="LCP 衡量页面主要内容渲染完成的时间。" /></Col>
            <Col span={8}><MetricCard label="TBT (总阻塞时间)" value={metrics.tbt} unit="ms" format={(v: any) => `${Math.round(v)} ms`} status={getStatus(metrics.tbt, 'tbt')} info="TBT 衡量主线程被阻塞，导致无法响应用户输入的时间。" /></Col>
            <Col span={8}><MetricCard label="CLS (累计布局偏移)" value={metrics.cls} unit="" format={(v: any) => v.toFixed(3)} status={getStatus(metrics.cls, 'cls')} info="CLS 衡量页面生命周期内发生的非预期布局偏移的总和。" /></Col>
            <Col span={8}><MetricCard label="页面体量" value={metrics.pageWeight} unit="MB" format={(v: any) => `${(v/1024/1024).toFixed(2)} MB`} status="none" info="页面体量是加载该页面所需下载的所有资源的总大小。" /></Col>
          </Row>

          {/* Filmstrip */}
          <Filmstrip lhr={lhr} metrics={metrics} />

          {/* Video & LCP Element */}
          <Row gutter={16}>
            <Col span={12}>
              <VideoPlayer thumbnails={lhr?.audits?.['screenshot-thumbnails']?.details?.items || []} />
            </Col>
            <Col span={12}>
              <LcpElementPanel lhr={lhr} screenshot={reportData.screenshot} />
            </Col>
          </Row>

          {/* Recos */}
          <Card title="主要优化建议" className="shadow-sm border-gray-100" size="small">
            <Collapse 
              ghost 
              expandIconPlacement="end" 
              className="reco-collapse"
              items={Object.values(lhr.audits)
                .filter((a: any) => a.score !== null && a.score < 0.9 && (a.details?.type === 'opportunity' || a.details?.type === 'critical-request-chains'))
                .sort((a: any, b: any) => (a.score || 0) - (b.score || 0))
                .slice(0, 10)
                .map((audit: any, i: number) => ({
                  key: i,
                  label: (
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${audit.score < 0.5 ? 'bg-red-500' : 'bg-orange-500'}`} />
                      <Text strong className="text-sm">{audit.title}</Text>
                      {audit.displayValue && <Tag className="m-0 text-[10px]">{audit.displayValue}</Tag>}
                    </div>
                  ),
                  children: (
                    <div className="pl-5 text-xs text-gray-500 space-y-2">
                      <p>{audit.description}</p>
                      {audit.details?.items?.length > 0 && (
                        <div className="bg-gray-50 p-2 rounded text-[10px]">
                          共 {audit.details.items.length} 个相关资源
                        </div>
                      )}
                    </div>
                  )
                }))
              }
            />
          </Card>
        </div>
      )
    },
    {
      key: 'html',
      label: 'HTML 报告 (原生)',
      children: (
        <div className="bg-white rounded-lg shadow-inner h-[800px] border border-gray-200">
          <iframe 
            src={`${API_BASE_URL}/reports/${reportId}`} 
            className="w-full h-full border-none"
            title="Lighthouse HTML Report"
          />
        </div>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-12">
      <div className="max-w-[1200px] mx-auto pt-6 px-6">
        <div className="mb-4 flex items-center justify-between">
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate(-1)}
            type="text"
            className="hover:bg-white flex items-center"
          >
            返回
          </Button>
          <Text type="secondary">报告 ID: {reportId}</Text>
        </div>

        <Tabs 
          defaultActiveKey="overview" 
          items={items} 
          size="large"
          className="report-tabs"
        />
      </div>
    </div>
  )
}

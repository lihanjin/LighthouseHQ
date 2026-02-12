import { Router } from 'express'
import { supabase } from '../lib/supabase.js'

const router = Router()

// Get report details (supports JSON or HTML)
router.get('/:id', async (req, res) => {
  const { id } = req.params
  const { format, translate } = req.query

  if (format === 'json') {
    const { data, error } = await supabase
      .from('reports')
      .select('id, task_id, url, device, location, status, error_message, created_at, performance_score, accessibility_score, best_practices_score, seo_score, fcp, lcp, tbt, cls, speed_index, total_byte_weight, screenshot, lighthouse_data')
      .eq('id', id)
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Report not found' })
    }

    return res.json({ success: true, data })
  }
  
  const { data, error } = await supabase
    .from('reports')
    .select('html_report')
    .eq('id', id)
    .single()

  if (error || !data) {
    return res.status(404).send('Report not found')
  }

  // Directly return the HTML string for iframe rendering
  res.setHeader('Content-Type', 'text/html')
  
  let html = data.html_report
  
  // Inject translation script for historical English reports unless disabled
  if (translate !== '0') {
    const translationScript = `
<script>
(function() {
  const i18n = {
    'Performance': '性能',
    'Accessibility': '无障碍',
    'Best Practices': '最佳实践',
    'SEO': 'SEO',
    'First Contentful Paint': '首次内容绘制 (FCP)',
    'Largest Contentful Paint': '最大内容绘制 (LCP)',
    'Total Blocking Time': '总阻塞时间 (TBT)',
    'Cumulative Layout Shift': '累计布局偏移 (CLS)',
    'Speed Index': '速度指数',
    'Opportunities': '优化建议',
    'Diagnostics': '诊断',
    'Passed audits': '已通过审计',
    'Show': '显示',
    'Hide': '隐藏',
    'Expand view': '展开详情',
    'Savings': '预估节省',
    'View Treemap': '查看树状图',
    'Calculator': '计算器',
    'Values are estimated and may vary.': '数值为估算值，可能会有所波动。',
    'METRICS': '核心指标',
  };

  function translate() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while (walker.nextNode()) {
      node = walker.currentNode;
      const trimmed = node.textContent.trim();
      if (i18n[trimmed]) {
        node.textContent = node.textContent.replace(trimmed, i18n[trimmed]);
      } else {
        // Partial match for common phrases
        for (const [en, zh] of Object.entries(i18n)) {
          if (node.textContent.includes(en) && en.length > 5) {
            node.textContent = node.textContent.replace(en, zh);
          }
        }
      }
    }
    // Also handle specific attributes like titles or button text
    document.querySelectorAll('.lh-audit__title, .lh-audit__display-text, .lh-category-header__title').forEach(el => {
       const key = el.textContent.trim();
       if (i18n[key]) el.textContent = i18n[key];
    });
  }

  // Initial translation
  translate();
  
  // Lighthouse UI is dynamic, use Observer
  const observer = new MutationObserver((mutations) => {
    translate();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
</script>
`;
    // Inject before closing body tag
    html = html.replace('</body>', translationScript + '</body>');
  }

  res.send(html)
})

export default router

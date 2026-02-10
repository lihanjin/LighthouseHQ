CREATE OR REPLACE VIEW project_latest_stats AS
WITH latest_tasks AS (
    SELECT DISTINCT ON (project_id) id, project_id, created_at
    FROM tasks
    WHERE status = 'completed'
    ORDER BY project_id, created_at DESC
),
task_aggregates AS (
    SELECT 
        task_id,
        ROUND(AVG(performance_score)) as avg_performance,
        AVG(lcp) as avg_lcp,
        AVG(tbt) as avg_tbt,
        AVG(cls) as avg_cls,
        AVG(total_byte_weight) as avg_weight
    FROM reports
    GROUP BY task_id
)
SELECT 
    lt.project_id,
    ta.avg_performance,
    ta.avg_lcp,
    ta.avg_tbt,
    ta.avg_cls,
    ta.avg_weight,
    lt.created_at as last_run_at
FROM latest_tasks lt
JOIN task_aggregates ta ON lt.id = ta.task_id;

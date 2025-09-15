// C:\parser_service\scripts\run_job.jsx
// Loads per-job config first, then exporter.
// IMPORTANT: runtime/job.jsx is overwritten per request by app.py

#target illustrator

// Include the per-job configuration (defines __JOB)
#include "C:/parser_service/scripts/runtime/job.jsx"

// Include the exporter (which prefers __JOB and falls back to env if needed)
#include "C:/parser_service/scripts/export.jsx"

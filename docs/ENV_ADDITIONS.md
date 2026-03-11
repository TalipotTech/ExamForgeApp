# ──────── ADDITIONS for Syllabus Pipeline ────────

# Add these to your existing .env.local

# ──────── DOCUMENT PROCESSING ────────

# Azure Document Intelligence (optional — for complex scanned PDFs)

AZURE_DI_ENDPOINT=
AZURE_DI_API_KEY=

# Unstructured.io (optional — for layout-preserving extraction)

UNSTRUCTURED_API_KEY=
UNSTRUCTURED_API_URL=https://api.unstructured.io/general/v0/general

# ──────── S3 UPLOAD CONFIG ────────

S3_SYLLABUS_PREFIX=syllabi/
S3_PRESIGNED_URL_EXPIRY_SECONDS=3600
S3_MAX_FILE_SIZE_MB=50

# ──────── MULTI-AGENT CONFIG ────────

# Timeout per provider in multi-agent mode (ms)

MULTI_AGENT_TIMEOUT_MS=60000

# Max providers to fan-out to simultaneously

MULTI_AGENT_MAX_CONCURRENT=5

# Merge strategy default: combine | best_of | vote

MULTI_AGENT_DEFAULT_MERGE=combine

# ──────── TUTORIAL GENERATION ────────

TUTORIAL_MAX_TOKENS=4000
TUTORIAL_TEMPERATURE=0.7
MCQ_MAX_PER_REQUEST=50
MCQ_DEFAULT_COUNT=10

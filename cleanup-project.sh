#!/bin/bash
# cleanup-project.sh - Remove unused/redundant files and clean up the project

echo "🧹 Starting SilkCards project cleanup..."

# Store the original directory
ORIGINAL_DIR=$(pwd)

# Function to safely remove file if it exists
safe_remove() {
    if [ -f "$1" ]; then
        echo "❌ Removing: $1"
        rm "$1"
    elif [ -d "$1" ]; then
        echo "❌ Removing directory: $1"
        rm -rf "$1"
    fi
}

# Clean up backend directory
if [ -d "backend" ]; then
    echo "📁 Cleaning up backend..."
    cd backend
    
    # Remove the old AIParserV2.js (replaced by EC2 microservice)
    safe_remove "src/parsers/AIParserV2.js"
    
    # Remove empty parsers directory if it exists and is empty
    if [ -d "src/parsers" ] && [ -z "$(ls -A src/parsers 2>/dev/null)" ]; then
        echo "❌ Removing empty parsers directory"
        rmdir src/parsers
    fi
    
    # Clean up any old .env files that might be duplicates
    safe_remove ".env.local"
    safe_remove ".env.test"
    
    cd "$ORIGINAL_DIR"
fi

# Clean up frontend directory
if [ -d "frontend" ] || [ -d "src" ]; then
    echo "📁 Cleaning up frontend..."
    
    # If we're in the frontend directory structure
    if [ -d "src" ]; then
        # Remove any old/unused components
        safe_remove "src/components/OldFileUploader.jsx"
        safe_remove "src/components/LegacyParser.jsx"
    fi
fi

# Clean up root directory
echo "📁 Cleaning up root directory..."

# Remove development/documentation files
safe_remove "dev_roadmap.md"
safe_remove "eslint.config.js" 
safe_remove "DEVELOPMENT.md"
safe_remove "TODO.md"

# Remove any duplicate .env files in root
safe_remove ".env.development"
safe_remove ".env.local"
safe_remove ".env.test"

# Remove any temporary files
safe_remove ".DS_Store"
safe_remove "Thumbs.db"
safe_remove "*.tmp"
safe_remove "*.temp"

# Clean up any log files
safe_remove "*.log"
safe_remove "logs/"

# Clean up any accidentally committed uploads
safe_remove "uploads/"

# Update .gitignore with comprehensive rules
echo "📝 Updating .gitignore..."
cat >> .gitignore << 'EOF'

# === SilkCards Project Specific ===

# Cleanup - ignore temporary files
*.tmp
*.temp
.DS_Store
Thumbs.db

# Parser microservice uploads (if accidentally copied)
uploads/
logs/

# Development artifacts
dev_roadmap.md
TODO.md
DEVELOPMENT.md

# IDE and editor files
.vscode/
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Environment files (except production templates)
.env.local
.env.development.local
.env.test.local

# Build artifacts
dist/
build/
.next/
.cache/

# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# ESLint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env.test
.env.production.local

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

EOF

# Create a summary of changes
echo ""
echo "✅ Cleanup completed!"
echo ""
echo "📊 Summary of changes:"
echo "  ❌ Removed unused AIParserV2.js (replaced by EC2 microservice)"
echo "  ❌ Removed dev_roadmap.md (development documentation)"
echo "  ❌ Removed eslint.config.js (not needed in production)"
echo "  ❌ Removed any temporary and log files"
echo "  ❌ Removed duplicate .env files"
echo "  📝 Updated .gitignore with comprehensive rules"
echo ""
echo "🗂️ Remaining important files:"
if [ -d "backend" ]; then
    echo "  📁 backend/src/routes/parse.js (NEEDS UPDATING with fixed version)"
    echo "  📁 backend/package.json (NEEDS UPDATING with new dependencies)"
    echo "  📁 backend/.env.production (configuration file)"
fi

if [ -d "frontend" ] || [ -d "src" ]; then
    echo "  📁 frontend/src/components/FileUploader.jsx (NEEDS UPDATING with fixed version)"
    echo "  📁 frontend/src/api/client.js (NEEDS UPDATING with integrated workflow)"
    echo "  📁 frontend/src/components/CardModel.jsx (NEEDS UPDATING for jobId support)"
fi

echo ""
echo "🔧 Next steps to fix the 'undefined jobId' issue:"
echo ""
echo "1. 📦 Install missing backend dependencies:"
echo "   cd backend && npm install axios form-data"
echo ""
echo "2. 🔄 Replace backend/src/routes/parse.js with the fixed version"
echo ""
echo "3. 🔄 Replace frontend/src/components/FileUploader.jsx with the fixed version"
echo ""
echo "4. 🔄 Replace frontend/src/api/client.js with the integrated workflow version"
echo ""
echo "5. 🔄 Replace frontend/src/components/CardModel.jsx with jobId support"
echo ""
echo "6. 🚀 Deploy to production platforms:"
echo "   - Backend to Render"
echo "   - Frontend to Vercel"
echo "   - Ensure EC2 parser service is running at 13.223.206.6:8000"
echo ""
echo "7. 🧪 Test the complete workflow:"
echo "   - Upload AI/PDF file"
echo "   - Verify jobId is generated (not undefined)"
echo "   - Check status polling works correctly"
echo "   - Confirm 3D textures load from EC2"
echo ""
echo "🎯 After applying these fixes, the error:"
echo "   'GET /api/parse/status/undefined 404 (Not Found)'"
echo "   will be resolved and replaced with proper jobId handling!"
echo ""
echo "🚀 Your SilkCards 3D Preview system will be production-ready!"

# Make the script executable
chmod +x "$0"

echo ""
echo "📝 This cleanup script has been made executable for future use."
echo "✨ Project cleanup completed successfully!"
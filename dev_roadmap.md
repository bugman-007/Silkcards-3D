# SilkCards 3D Preview - Detailed Development Roadmap

## Phase 0: Project Setup (Day 1)

### **Frontend Setup (Vite + React + JavaScript)**
```bash
# 1. Create Vite React project (JavaScript)
npm create vite@latest silkcards-3d-frontend -- --template react
cd silkcards-3d-frontend
npm install

# 2. Install Three.js and React dependencies
npm install three @react-three/fiber @react-three/drei
npm install axios
npm install zustand (for state management)
npm install react-router-dom (for shareable links)

# 3. Project structure
src/
├── main.jsx             # App entry point
├── App.jsx              # Main app component
├── pages/
│   ├── EmbedViewer.jsx  # Embeddable viewer
│   └── ShareViewer.jsx  # Standalone shareable page
├── components/
│   ├── FileUploader.jsx # File upload component
│   ├── ThreeViewer.jsx  # 3D scene wrapper
│   ├── ControlPanel.jsx # UI controls
│   ├── LoadingSpinner.jsx
│   ├── ErrorBoundary.jsx
│   └── ShareControls.jsx # Share/embed controls
├── hooks/
│   ├── useFileUpload.js # File upload logic
│   ├── useCardParser.js # Parsing state
│   └── useThreeScene.js # 3D scene management
├── three/
│   ├── CardScene.jsx    # React Three Fiber scene
│   ├── CardModel.jsx    # 3D card component
│   ├── Materials.js     # Effect materials
│   └── Lighting.jsx     # Scene lighting
├── store/
│   └── cardStore.js     # Zustand state store
├── utils/
│   ├── embedGenerator.js # Generate embed code
│   └── shareUtils.js    # Share link utilities
├── api/
│   └── client.js        # Backend API calls
└── styles/
    └── index.css        # Tailwind/CSS
```
```

### **Backend Setup (Node.js + Express)**
```bash
# 1. Create backend project
mkdir silkcards-3d-backend
cd silkcards-3d-backend
npm init -y

# 2. Install dependencies
npm install express multer cors body-parser
npm install pdf-parse canvas fabric
npm install sharp (for image processing)
npm install uuid (for generating share IDs)
npm install redis (for caching shared previews)

# 3. Project structure
src/
├── app.js              # Express server
├── routes/
│   ├── upload.js       # File upload endpoint
│   ├── parse.js        # Parsing endpoint
│   ├── share.js        # Share/embed endpoints
│   └── embed.js        # Embed-specific routes
├── parsers/
│   ├── AIParser.js     # Illustrator file parser
│   ├── PDFParser.js    # PDF file parser
│   └── LayerDetector.js # Effect layer detection
├── processors/
│   ├── EffectMapper.js # Map layers to 3D effects
│   └── GeometryBuilder.js # Convert paths to geometry
├── services/
│   ├── ShareService.js # Handle shareable links
│   └── EmbedService.js # Generate embed codes
└── utils/
    └── helpers.js      # Utility functions
```

---

## Phase 1: Core Infrastructure (Days 2-3)

### **Day 2: Basic 3D Scene**
#### **Frontend - Three.js Foundation**
```javascript
// src/three/Scene.js - Basic scene setup
- Create WebGL renderer
- Setup camera (perspective, position, controls)
- Add basic lighting (ambient + directional)
- Create orbit controls for interaction
- Render loop implementation

// src/three/CardGeometry.js - Basic card model
- Create business card geometry (89mm x 51mm x 0.35mm)
- Basic material assignment
- Position and scale setup
```

#### **Backend - File Upload System**
```javascript
// src/routes/upload.js - File handling
- Multer configuration for .ai/.pdf files
- File validation and size limits
- Temporary file storage
- Response with file ID
```

### **Day 3: File Upload UI**
```javascript
// src/components/FileUploader.js
- Drag & drop interface
- File type validation (.ai, .pdf)
- Upload progress indicator
- Error handling and user feedback
```

---

## Phase 2: File Parsing Engine (Days 4-6)

### **Day 4: AI File Parser**
```javascript
// src/parsers/AIParser.js
- Extract AI file structure using node-canvas-api
- Read layer information and names
- Extract vector paths and shapes
- Convert to standardized data format

// Expected output format:
{
  "cardDimensions": { "width": 89, "height": 51, "thickness": 0.35 },
  "layers": [
    {
      "name": "foil_gold",
      "type": "effect",
      "paths": [...], // Vector paths
      "bounds": { x, y, width, height }
    }
  ]
}
```

### **Day 5: Layer Detection System**
```javascript
// src/parsers/LayerDetector.js
- Detect layer naming patterns:
  * "foil_*" (gold, silver, copper, etc.)
  * "spot_uv" or "uv_*"
  * "emboss" / "deboss"
  * "die_cut" / "cut_line"
  * "edge_ink_*"
- Categorize layers by effect type
- Validate layer structure
```

### **Day 6: Effect Mapper**
```javascript
// src/processors/EffectMapper.js
- Map detected layers to 3D material properties:
  * Foil → Metallic materials with reflection
  * Spot UV → Glossy clear coat
  * Emboss → Displacement mapping
  * Die-cut → Geometry modification
- Generate texture masks from vector paths
- Output render-ready data
```

---

## Phase 3: 3D Rendering System (Days 7-10)

### **Day 7: Material System**
```javascript
// src/three/Materials.js
- Paper stock materials:
  * Matte, silk, glossy finishes
  * Different thicknesses and textures
- Effect materials:
  * Metallic foils (PBR materials)
  * Spot UV (high reflection, clear coat)
  * Emboss materials with normal maps
```

### **Day 8: Effect Rendering**
```javascript
// src/three/CardGeometry.js - Enhanced
- Apply texture masks to card geometry
- Implement foil effect rendering
- Add spot UV glossy layers
- Basic emboss/deboss displacement
```

### **Day 9: Interactive Controls**
```javascript
// src/components/ControlPanel.js
- Rotation controls (auto-rotate toggle)
- Zoom controls
- Lighting adjustment sliders
- Effect visibility toggles
- Reset view button
```

### **Day 10: Integration & Testing**
```javascript
// Full pipeline integration:
// Upload File → Parse → Generate 3D → Display
- Connect frontend to backend API
- Handle loading states
- Error handling throughout pipeline
- Performance optimization
```

---

## Phase 4: Advanced Features (Days 11-14)

### **Day 11: Share & Embed System**
```javascript
// Share functionality:
// src/components/ShareControls.jsx
- Generate shareable link after successful render
- Copy to clipboard functionality
- Social media share buttons
- QR code generation for mobile sharing

// src/utils/shareUtils.js
- Create unique share IDs
- Generate shareable URLs
- Handle expiration dates
- Track share analytics
```

### **Day 12: Embed System**
```javascript
// Embeddable widget:
// src/pages/EmbedViewer.jsx
- Standalone viewer for iframe embedding
- Minimal UI for embedding
- Responsive design for different container sizes
- PostMessage API for parent-child communication

// src/utils/embedGenerator.js
- Generate iframe embed codes
- JavaScript widget embed option
- Customizable width/height parameters
- API for external website integration

// Backend: src/services/EmbedService.js
- Serve embed-specific HTML
- Handle CORS for iframe embedding
- Generate embed scripts
- Track embed usage
```

### **Day 13: Enhanced Materials**
```javascript
// Advanced material effects:
- Holographic foil with rainbow reflection
- Multiple foil colors (gold, silver, copper, rose gold)
- Paper texture variations
- Edge ink rendering on card thickness
```

### **Day 14: Lighting System**
```javascript
// src/three/Lighting.jsx
- Environment mapping for realistic reflections
- Dynamic lighting scenarios:
  * Office lighting
  * Dramatic lighting
  * Natural light
- Shadow casting and receiving
```

---

## Phase 5: Production Polish (Days 15-18)

### **Day 15: Performance Optimization**
```javascript
// Optimization strategies:
- Level-of-detail (LOD) for complex geometries
- Texture compression and loading
- Efficient shader compilation
- Memory management
- Mobile device compatibility
```

### **Day 16: User Experience**
```javascript
// Enhanced UI/UX:
- Smooth animations and transitions
- Loading indicators with progress
- Intuitive camera controls
- Mobile-responsive design
- Accessibility improvements

// Embed-specific UX:
- Minimal interface for embedded version
- Touch controls for mobile embeds
- Keyboard navigation support
- Screen reader compatibility
```

### **Day 17: Integration Preparation**
```javascript
// API for Henry's system:
// Multiple integration options:

// 1. Iframe Embed (Simple)
<iframe 
  src="https://preview.silkcards.com/embed/abc123"
  width="600" 
  height="400"
  frameborder="0">
</iframe>

// 2. JavaScript Widget (Advanced)
<div id="silkcards-preview"></div>
<script src="https://preview.silkcards.com/embed.js"></script>
<script>
  SilkCardsPreview.init({
    containerId: 'silkcards-preview',
    shareId: 'abc123',
    width: 600,
    height: 400
  });
</script>

// 3. Direct API Integration (Custom)
- RESTful endpoints for file processing
- Webhook support for async processing
- Authentication system (if needed)
- CORS configuration for cross-origin requests
```

### **Day 18: Die-Cut Implementation (Basic)**
```javascript
// Basic die-cut shapes:
- Rounded corners
- Simple geometric cuts (circles, squares)
- Edge highlighting
- Cut-through transparency effects
```

---

## Phase 6: Deployment & Handover (Days 19-21)

### **Day 19: Deployment Setup**
```javascript
// Production deployment:
- Frontend: Deploy to Netlify/Vercel
- Backend: Deploy to AWS/Digital Ocean
- Database: Set up file storage (AWS S3)
- CDN configuration for assets
- SSL certificates and security
```

### **Day 20: Integration with SilkCards**
```javascript
// System integration:
- Embed 3D viewer in existing proofing system
- API integration with Oleksii
- User workflow testing
- Performance monitoring setup
```

### **Day 21: Final Testing & Handover**
```javascript
// Final deliverables:
- Complete system documentation
- API integration guide
- User training materials
- Performance optimization report
- Source code handover with comments
```

---

## Key API Endpoints Structure

```javascript
// Backend API Design
POST /api/upload          // Upload AI/PDF file
GET  /api/parse/:fileId   // Parse uploaded file
GET  /api/preview/:fileId // Get 3D preview data
POST /api/process         // Process file with options
GET  /api/status/:jobId   // Check processing status

// Share & Embed Endpoints
POST /api/share           // Create shareable link
GET  /api/share/:shareId  // Get shared preview data
GET  /api/embed/:shareId  // Get embed HTML/JS
GET  /api/embed/script    // Embed script for websites

// Response formats:
// Upload response:
{ "fileId": "uuid", "fileName": "card.ai", "size": 1024000 }

// Share response:
{ 
  "shareId": "abc123",
  "shareUrl": "https://preview.silkcards.com/share/abc123",
  "embedCode": "<iframe src='...'></iframe>",
  "embedScript": "<script>...</script>"
}

// Parse response:
{
  "fileId": "uuid",
  "cardData": {
    "dimensions": { "width": 89, "height": 51, "thickness": 0.35 },
    "effects": [
      {
        "type": "foil",
        "color": "gold",
        "geometry": [...],
        "material": { "metallic": 1.0, "roughness": 0.1 }
      }
    ]
  }
}
```

---

## Technology Stack Summary

### **Frontend (Vite Project)**
- **Framework:** Vanilla JS with Vite
- **3D Rendering:** Three.js + WebGL
- **UI:** Custom components with modern CSS
- **HTTP Client:** Axios
- **Animations:** Tween.js

### **Backend (Node.js)**
- **Framework:** Express.js
- **File Processing:** Multer, Sharp, Canvas
- **AI Parsing:** Custom parser with node-canvas-api
- **PDF Processing:** pdf-parse, PDF.js
- **Storage:** Local filesystem → AWS S3 (production)

### **Development Tools**
- **Build:** Vite (frontend), Node.js (backend)
- **Version Control:** Git with feature branches
- **Testing:** Manual testing + performance monitoring
- **Deployment:** Netlify/Vercel (frontend), AWS/DO (backend)

---

## Daily Progress Tracking

### **Week 1 Goals:**
- [ ] Day 1: Complete project setup
- [ ] Day 2-3: Basic 3D scene + file upload
- [ ] Day 4-6: File parsing engine
- [ ] Day 7: First working prototype

### **Week 2 Goals:**
- [ ] Day 8-10: 3D rendering with effects
- [ ] Day 11-12: Advanced materials and lighting
- [ ] Day 13-14: Basic die-cuts and optimization

### **Week 3 Goals:**
- [ ] Day 15-16: Production polish and error handling
- [ ] Day 17-18: Integration preparation and testing
- [ ] Day 19-21: Deployment and handover

---

## Risk Mitigation Checkpoints

### **Daily Checkpoints:**
- Does the build work without errors?
- Are API endpoints responding correctly?
- Is the 3D rendering performing well?
- Can I parse at least one sample file?

### **Weekly Milestones:**
- **Week 1:** Working file upload + basic 3D card
- **Week 2:** Parsed effects render correctly in 3D
- **Week 3:** Production-ready system with documentation

### **Go/No-Go Decision Points:**
- **Day 7:** If file parsing isn't working, escalate immediately
- **Day 14:** If performance is poor, prioritize optimization
- **Day 18:** If integration issues arise, communicate with Henry

---

**Success Criteria:** Upload AI file → Parse layers → Render realistic 3D preview with foil, spot UV, emboss effects → Interactive rotation/zoom → Export/share functionality

**Timeline Buffer:** Built-in 2-3 days buffer for unexpected complexity or client feedback integration.
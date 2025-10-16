// src/components/CardModel.jsx - OPTIMIZED VERSION
import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, Plane } from "@react-three/drei";
import * as THREE from "three";
import { getAssetUrl } from "../api/client";
import EffectOverlay from "./EffectOverlay";
import BaseCard from "./BaseCard";

// Helper to check if mask texture has meaningful content
function maskLooksFilled(tex) {
  if (!tex || !tex.image) return false;
  try {
    const img = tex.image;
    const w = img.width,
      h = img.height;
    if (!w || !h) return false;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    let bright = 0,
      total = 0;
    const stepX = Math.max(1, Math.floor(w / 64));
    const stepY = Math.max(1, Math.floor(h / 64));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2],
          a = data[i + 3];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (a > 10 && lum > 0.6) bright++;
        total++;
      }
    }
    return bright / Math.max(1, total) > 0.05;
  } catch {
    return false;
  }
}

// Convert colored PNG to binary mask (white on black)
// Convert colored PNG to binary mask (white on black) - FIXED VERSION
function toBinaryMaskCanvas(image) {
  if (!image) return null;
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // 1px erosion kernel (remove tiny white rim at grazing angles)
  const W = w, H = h;
  const copy = new Uint8ClampedArray(d); // copy before we mutate
  const lum = (i) => 0.2126*copy[i] + 0.7152*copy[i+1] + 0.0722*copy[i+2];

  // binarize pass
  for (let i = 0; i < d.length; i += 4) {
    const m = lum(i) > 128 ? 255 : 0;     // >128 = keep(white); <=128 = hole(black)
    d[i] = d[i+1] = d[i+2] = m; d[i+3] = 255;
  }

  // 1px erosion on WHITE (keep) area — optional but helps prevent halos
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const idx = (y*W + x) * 4;
      if (d[idx] === 255) {
        // if any neighbor is black, turn this pixel black
        let erode = false;
        for (let dy=-1; dy<=1 && !erode; dy++){
          for (let dx=-1; dx<=1; dx++){
            const n = ((y+dy)*W + (x+dx)) * 4;
            if (d[n] === 0) { erode = true; break; }
          }
        }
        if (erode) d[idx] = d[idx+1] = d[idx+2] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function CardModel({ cardData, autoRotate = false, showEffects = true }) {
  const cardRef = useRef();
  const { gl } = useThree();
  const SHOW_DEBUG_MASK = true; // set true only when you want to visualize it

  // Extract jobId for asset loading
  const jobId = useMemo(() => {
    const pr = cardData?.parseResult || {};
    return cardData?.jobId || pr.jobId || pr.job_id || cardData?.id || null;
  }, [cardData]);

  // Convert dimensions from mm to meters for Three.js
  const cardDimensions = useMemo(() => {
    const dims = cardData?.dimensions ||
      cardData?.parseResult?.dimensions || {
        width: 89,
        height: 51,
        thickness: 0.35,
      };
    return {
      width: (dims.width || 89) / 1000,
      height: (dims.height || 51) / 1000,
      thickness: Math.max(0.00035, (dims.thickness || 0.35) / 1000),
    };
  }, [cardData]);

  // Extract structured card data from adapter output - FIXED BUG
  const cardSides = useMemo(() => {
    if (!cardData)
      return { front: {}, back: {}, frontLayers: [], backLayers: [] };

    const cards = cardData?.cards || {};
    const front = cards.front || {};
    const back = cards.back || {};
    const pr = cardData?.parseResult || {};
    const fc = Array.isArray(pr.front_cards) ? pr.front_cards : [];
    const bc = Array.isArray(pr.back_cards) ? pr.back_cards : [];

    // FIXED: Proper layer normalization with maps object priority
    const normLayer = (rec) => {
      const maps = rec?.maps || {};

      const albedoUrl =
        maps.albedo_png ||
        rec?.albedo ||
        rec?.print ||
        rec?.albedo_png ||
        rec?.albedoUrl ||
        rec?.image ||
        rec?.albedo_path ||
        null;

      const dieCutUrl =
        maps.die_png || // Parser's PNG output - HIGHEST PRIORITY
        maps.diecut_mask || // Alternative PNG name
        maps.diecut_png || // Alternative PNG name
        rec?.die_png || // Direct from record
        maps.die_svg || // SVG fallback (only if no PNG)
        rec?.die_svg || // SVG from record
        maps.diecut_svg || // SVG alternative
        rec?.diecut_mask ||
        rec?.diecut_png ||
        rec?.diecut_svg ||
        rec?.die ||
        rec?.diecut ||
        null;

      console.log("DIE-CUT RESOLUTION - FINAL:", {
        hasPng: !!(
          maps.die_png ||
          maps.diecut_mask ||
          maps.diecut_png ||
          rec?.die_png
        ),
        hasSvg: !!(maps.die_svg || rec?.die_svg),
        finalUrl: dieCutUrl,
        fileType: dieCutUrl?.toLowerCase().endsWith(".png")
          ? "PNG"
          : dieCutUrl?.toLowerCase().endsWith(".svg")
          ? "SVG"
          : "NONE",
      });

      const foilMask = maps.foil || rec?.foil || rec?.foil_mask || null;
      const foilColor =
        maps.foil_color || rec?.foil_color || rec?.foilColour || null;
      const uvMask =
        maps.uv ||
        maps.spot_uv ||
        rec?.uv ||
        rec?.spot_uv ||
        rec?.spotuv ||
        rec?.uv_mask ||
        null;
      const emboss =
        maps.emboss || maps.deboss || rec?.emboss || rec?.deboss || null;

      return {
        albedoUrl,
        dieCutUrl,
        foilLayers:
          foilMask || foilColor
            ? [{ colorUrl: foilColor, maskUrl: foilMask }]
            : [],
        uvLayers: uvMask ? [{ maskUrl: uvMask }] : [],
        embossLayers: emboss
          ? [{ maskUrl: emboss, type: rec?.deboss ? "deboss" : "emboss" }]
          : [],
      };
    };

    const frontLayers = fc.map(normLayer);
    const backLayers = bc.map(normLayer);

    return {
      front: {
        albedoUrl:
          front.maps?.albedo_png ||
          front.albedoUrl ||
          front.albedo ||
          front.print ||
          null,
        dieCutUrl:
          front.maps?.diecut_mask ||
          front.maps?.diecut_png ||
          front.maps?.die_png || // ← add
          front.maps?.die_svg ||
          front.dieCutUrl ||
          front.die_png ||
          front.die_mask ||
          front.maps?.diecut_svg ||
          front.die_svg ||
          front.diecut_mask ||
          front.diecut_png ||
          front.diecut_svg ||
          null,
        foilLayers: Array.isArray(front.foilLayers) ? front.foilLayers : [],
        uvLayers: Array.isArray(front.uvLayers) ? front.uvLayers : [],
        embossLayers: Array.isArray(front.embossLayers)
          ? front.embossLayers
          : [],
      },
      back: {
        albedoUrl:
          back.maps?.albedo_png ||
          back.albedoUrl ||
          back.albedo ||
          back.print ||
          null,
        dieCutUrl:
          back.maps?.diecut_mask ||
          back.maps?.diecut_png ||
          back.dieCutUrl ||
          back.die_png ||
          back.die_mask ||
          back.maps?.diecut_svg ||
          back.die_svg ||
          back.diecut_mask ||
          back.diecut_png ||
          back.diecut_svg ||
          null,
        foilLayers: Array.isArray(back.foilLayers) ? back.foilLayers : [],
        uvLayers: Array.isArray(back.uvLayers) ? back.uvLayers : [],
        embossLayers: Array.isArray(back.embossLayers) ? back.embossLayers : [],
      },
      frontLayers,
      backLayers,
    };
  }, [cardData]);

  // Texture loading system
  const [textures, setTextures] = useState({
    front: {
      albedo: null,
      dieCut: null,
      foilLayers: [],
      uvLayers: [],
      embossLayers: [],
    },
    back: {
      albedo: null,
      dieCut: null,
      foilLayers: [],
      uvLayers: [],
      embossLayers: [],
    },
    frontLayers: [],
    backLayers: [],
  });
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Debug texture status
  useEffect(() => {
    console.log("=== TEXTURE LOADING STATUS ===", {
      frontDieCut: textures.front?.dieCut,
      frontLayersDieCut: textures.frontLayers?.[0]?.dieCut,
      frontLayersCount: textures.frontLayers?.length,
      allFrontLayers: textures.frontLayers?.map((layer, idx) => ({
        layer: idx,
        hasAlbedo: !!layer?.albedo?.image,
        hasDieCut: !!layer?.dieCut,
        dieCutType: layer?.dieCut?.image ? "loaded" : "missing",
      })),
    });
  }, [textures]);

  // Texture loading effect
  useEffect(() => {
    let cancelled = false;
    if (!jobId) {
      setTextures({
        front: {
          albedo: null,
          dieCut: null,
          foilLayers: [],
          uvLayers: [],
          embossLayers: [],
        },
        back: {
          albedo: null,
          dieCut: null,
          foilLayers: [],
          uvLayers: [],
          embossLayers: [],
        },
        frontLayers: [],
        backLayers: [],
      });
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    const isAbsoluteUrl = (s) =>
      typeof s === "string" && /^https?:\/\//i.test(s);
    const isRootAbsolute = (s) => typeof s === "string" && s.startsWith("/");
    const normalizeRel = (jid, relPath) => {
      if (typeof relPath !== "string" || !relPath) return null;
      if (isAbsoluteUrl(relPath) || isRootAbsolute(relPath)) return relPath;
      let p = relPath.replace(/^[\/\s]+/, "");
      p = p.replace(/^assets\/[^/]+\//i, "");
      p = p.replace(/^jobs\/[^/]+\/assets\//i, "");
      return p;
    };

    const loadTexture = (jid, relPath, isBack = false) => {
      return new Promise((resolve) => {
        if (!relPath) {
          resolve(null);
          return;
        }

        const rel = normalizeRel(jid, relPath);
        const url =
          /^https?:\/\//i.test(rel) || rel.startsWith("/")
            ? rel
            : getAssetUrl(jid, rel);

        console.log(`Loading texture: ${url} from original path: ${relPath}`);

        // Handle SVG files by converting them to PNG canvas
        if (relPath.toLowerCase().endsWith(".svg")) {
          console.log("Processing SVG die-cut file:", url);

          // Create a temporary image to load SVG
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (cancelled) {
              resolve(null);
              return;
            }

            // Convert SVG to PNG canvas
            const canvas = document.createElement("canvas");
            // Default to a safe raster size if the SVG reports zero dimensions
            const fallbackW = 2048,
              fallbackH = 1232;
            const w = img.width || img.naturalWidth || fallbackW;
            const h = img.height || img.naturalHeight || fallbackH;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");

            // Draw SVG to canvas
            ctx.drawImage(img, 0, 0, img.width, img.height);

            // Create texture from canvas
            const tex = new THREE.CanvasTexture(canvas);
            tex.flipY = true;
            tex.colorSpace = THREE.SRGBColorSpace;

            tex.needsUpdate = true;
            console.log("Successfully converted SVG to texture");
            resolve(tex);
          };

          img.onerror = () => {
            console.warn("Failed to load SVG image:", url);
            resolve(null);
          };

          img.src = url;
        } else {
          // Normal texture loading for PNG/JPG
          loader.load(
            url,
            (tex) => {
              if (cancelled || !tex) {
                resolve(null);
                return;
              }
              tex.flipY = true;
              tex.colorSpace = THREE.SRGBColorSpace;

              // REMOVED: Negative texture repeats - using rotation only for back faces
              // if (isBack) {
              //   tex.wrapS = THREE.RepeatWrapping;
              //   tex.repeat.x = -1;
              //   tex.offset.x = 1;
              // }

              tex.needsUpdate = true;
              resolve(tex);
            },
            undefined,
            () => resolve(null)
          );
        }
      });
    };

    const createMaskTexture = (colorTex) => {
      if (!colorTex || !colorTex.image) return colorTex?.clone() || null;
      try {
        const maskCanvas = toBinaryMaskCanvas(colorTex.image);
        if (!maskCanvas) return colorTex.clone();
        const maskTex = new THREE.CanvasTexture(maskCanvas);
        maskTex.flipY = true;
        maskTex.colorSpace = THREE.NoColorSpace;
        maskTex.needsUpdate = true;
        return maskTex;
      } catch {
        return colorTex.clone();
      }
    };

    const loadLayerTextures = async (layerData, isBack = false) => {
      const layerTextures = {
        albedo: null,
        dieCut: null,
        foilLayers: [],
        uvLayers: [],
        embossLayers: [],
      };

      // Load albedo
      if (layerData?.albedoUrl) {
        layerTextures.albedo = await loadTexture(
          jobId,
          layerData.albedoUrl,
          isBack
        );
      }

      // Load die-cut - CRITICAL: This is where PNG mask should load
      if (layerData?.dieCutUrl) {
        console.log(`Attempting to load die-cut: ${layerData.dieCutUrl}`);
        const dieTex = await loadTexture(jobId, layerData.dieCutUrl, isBack);
        if (dieTex?.image) {
          console.log(
            `Successfully loaded die-cut texture: ${layerData.dieCutUrl}`
          );
          const maskCanvas = toBinaryMaskCanvas(dieTex.image);
          if (maskCanvas) {
            const alphaTex = new THREE.CanvasTexture(maskCanvas);
            alphaTex.flipY = true;
            alphaTex.colorSpace = THREE.NoColorSpace;

            // ADD: Disable mipmaps for binary masks
            alphaTex.generateMipmaps = false;
            alphaTex.minFilter = THREE.LinearFilter;
            alphaTex.magFilter = THREE.LinearFilter;

            alphaTex.wrapS = THREE.ClampToEdgeWrapping;
            alphaTex.wrapT = THREE.ClampToEdgeWrapping;
            // if (isBack) {
            //   alphaTex.wrapS = THREE.RepeatWrapping;
            //   alphaTex.repeat.x = -1;
            //   alphaTex.offset.x = 1;
            // }
            alphaTex.needsUpdate = true;
            layerTextures.dieCut = alphaTex;
            console.log("Die-cut mask texture created successfully");
          }
        } else {
          console.warn(
            `Failed to load die-cut texture from: ${layerData.dieCutUrl}`
          );
        }
      }

      // Load effects (foil, UV, emboss)
      for (const f of layerData?.foilLayers || []) {
        let colorTex = null,
          maskTex = null;
        if (f.colorUrl) {
          colorTex = await loadTexture(jobId, f.colorUrl, isBack);
          if (colorTex) maskTex = createMaskTexture(colorTex);
        }
        if (!maskTex && f.maskUrl) {
          const raw = await loadTexture(jobId, f.maskUrl, isBack);
          if (raw) maskTex = createMaskTexture(raw);
        }
        if (isBack && maskTex) {
          maskTex.wrapS = THREE.RepeatWrapping;
          maskTex.repeat.x = -1;
          maskTex.offset.x = 1;
          maskTex.needsUpdate = true;
        }
        if (maskTex || colorTex)
          layerTextures.foilLayers.push({ colorTex, maskTex });
      }

      for (const u of layerData?.uvLayers || []) {
        if (u.maskUrl) {
          const raw = await loadTexture(jobId, u.maskUrl, isBack);
          if (raw) {
            const maskTex = createMaskTexture(raw);
            if (isBack && maskTex) {
              maskTex.wrapS = THREE.RepeatWrapping;
              maskTex.repeat.x = -1;
              maskTex.offset.x = 1;
              maskTex.needsUpdate = true;
            }
            layerTextures.uvLayers.push({ maskTex });
          }
        }
      }

      for (const e of layerData?.embossLayers || []) {
        if (e.maskUrl) {
          const raw = await loadTexture(jobId, e.maskUrl, isBack);
          if (raw) {
            const maskTex = createMaskTexture(raw);
            if (isBack && maskTex) {
              maskTex.wrapS = THREE.RepeatWrapping;
              maskTex.repeat.x = -1;
              maskTex.offset.x = 1;
              maskTex.needsUpdate = true;
            }
            layerTextures.embossLayers.push({
              maskTex,
              type: e.type || "emboss",
            });
          }
        }
      }

      return layerTextures;
    };

    const loadSideTextures = async (sideData, isBack = false) => {
      const sideTextures = {
        albedo: null,
        dieCut: null,
        foilLayers: [],
        uvLayers: [],
        embossLayers: [],
      };

      if (sideData.albedoUrl) {
        sideTextures.albedo = await loadTexture(
          jobId,
          sideData.albedoUrl,
          isBack
        );
      }

      if (sideData.dieCutUrl) {
        const dieTex = await loadTexture(jobId, sideData.dieCutUrl, isBack);
        if (dieTex?.image) {
          const maskCanvas = toBinaryMaskCanvas(dieTex.image);
          if (maskCanvas) {
            const alphaTex = new THREE.CanvasTexture(maskCanvas);
            alphaTex.flipY = true;
            alphaTex.colorSpace = THREE.NoColorSpace;

            // ADD: Disable mipmaps for binary masks
            alphaTex.generateMipmaps = false;
            alphaTex.minFilter = THREE.LinearFilter;
            alphaTex.magFilter = THREE.LinearFilter;

            alphaTex.wrapS = THREE.ClampToEdgeWrapping;
            alphaTex.wrapT = THREE.ClampToEdgeWrapping;
            // if (isBack) {
            //   alphaTex.wrapS = THREE.RepeatWrapping;
            //   alphaTex.repeat.x = -1;
            //   alphaTex.offset.x = 1;
            // }
            alphaTex.needsUpdate = true;
            sideTextures.dieCut = alphaTex;
          }
        }
      }

      // Load side-level effects
      for (const foilLayer of sideData.foilLayers) {
        let colorTex = null,
          maskTex = null;
        if (foilLayer?.colorUrl) {
          colorTex = await loadTexture(jobId, foilLayer.colorUrl, isBack);
          if (colorTex) maskTex = createMaskTexture(colorTex);
        }
        if (!maskTex && foilLayer?.maskUrl) {
          const rawMask = await loadTexture(jobId, foilLayer.maskUrl, isBack);
          if (rawMask) maskTex = createMaskTexture(rawMask);
        }
        if (isBack && maskTex) {
          maskTex.wrapS = THREE.RepeatWrapping;
          maskTex.repeat.x = -1;
          maskTex.offset.x = 1;
          maskTex.needsUpdate = true;
        }
        if (maskTex || colorTex)
          sideTextures.foilLayers.push({ colorTex, maskTex });
      }

      for (const uvLayer of sideData.uvLayers) {
        if (uvLayer?.maskUrl) {
          const colorTex = await loadTexture(jobId, uvLayer.maskUrl, isBack);
          if (colorTex) {
            const maskTex = createMaskTexture(colorTex);
            if (isBack && maskTex) {
              maskTex.wrapS = THREE.RepeatWrapping;
              maskTex.repeat.x = -1;
              maskTex.offset.x = 1;
              maskTex.needsUpdate = true;
            }
            sideTextures.uvLayers.push({ maskTex });
          }
        }
      }

      for (const embossLayer of sideData.embossLayers) {
        if (embossLayer?.maskUrl) {
          const colorTex = await loadTexture(
            jobId,
            embossLayer.maskUrl,
            isBack
          );
          if (colorTex) {
            const maskTex = createMaskTexture(colorTex);
            if (isBack && maskTex) {
              maskTex.wrapS = THREE.RepeatWrapping;
              maskTex.repeat.x = -1;
              maskTex.offset.x = 1;
              maskTex.needsUpdate = true;
            }
            sideTextures.embossLayers.push({
              maskTex,
              type: embossLayer.type || "emboss",
            });
          }
        }
      }

      return sideTextures;
    };

    const run = async () => {
      setLoadingProgress(0);
      try {
        const [frontTextures, backTextures, frontLayerTex, backLayerTex] =
          await Promise.all([
            loadSideTextures(cardSides.front, false),
            loadSideTextures(cardSides.back, true),
            Promise.all(
              (cardSides.frontLayers || []).map((L) =>
                loadLayerTextures(L, false)
              )
            ),
            Promise.all(
              (cardSides.backLayers || []).map((L) =>
                loadLayerTextures(L, true)
              )
            ),
          ]);

        if (!cancelled) {
          setTextures({
            front: frontTextures,
            back: backTextures,
            frontLayers: frontLayerTex,
            backLayers: backLayerTex,
          });
          setLoadingProgress(1);
        }
      } catch (error) {
        console.error("Error loading textures:", error);
        if (!cancelled) {
          setTextures({
            front: {
              albedo: null,
              dieCut: null,
              foilLayers: [],
              uvLayers: [],
              embossLayers: [],
            },
            back: {
              albedo: null,
              dieCut: null,
              foilLayers: [],
              uvLayers: [],
              embossLayers: [],
            },
            frontLayers: [],
            backLayers: [],
          });
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [jobId, cardSides]);

  // Memoized computed values
  const alphaFront = useMemo(() => {
    const l0 = textures.frontLayers?.[0]?.dieCut;
    return l0 || textures.front?.dieCut || null;
  }, [textures.frontLayers, textures.front?.dieCut]);

  const alphaBack = useMemo(
    () => textures.back?.dieCut || null,
    [textures.back?.dieCut]
  );

  const hasFrontLayerAlbedo = useMemo(() => {
    return (
      Array.isArray(textures.frontLayers) &&
      textures.frontLayers.some((L) => L?.albedo?.image)
    );
  }, [textures.frontLayers]);

  const { layers, cardsDetected, activeCard } = useMemo(() => {
    if (!cardData) return { layers: {}, cardsDetected: 0, activeCard: "front" };
    const cards = cardData?.items || cardData?.layers || {};
    const cardKeys = Object.keys(cards).filter(
      (key) => key === "front" || key === "back"
    );
    let activeCardData = cards.front || cards.back || {};
    let activeCardKey = "front";
    if (cardKeys.length > 0) {
      activeCardKey = cardKeys.includes("front") ? "front" : cardKeys[0];
      activeCardData = cards[activeCardKey] || {};
    }
    return {
      layers: activeCardData,
      cardsDetected: cardKeys.length,
      activeCard: activeCardKey,
    };
  }, [cardData]);

  const hasTextureData = useMemo(() => {
    const frontLayerAny =
      Array.isArray(textures.frontLayers) &&
      textures.frontLayers.some((L) => L?.albedo?.image);
    const backLayerAny =
      Array.isArray(textures.backLayers) &&
      textures.backLayers.some((L) => L?.albedo?.image);
    return (
      frontLayerAny ||
      backLayerAny ||
      !!textures.front?.albedo?.image ||
      !!textures.back?.albedo?.image ||
      (textures.front?.foilLayers?.length || 0) > 0 ||
      (textures.back?.foilLayers?.length || 0) > 0 ||
      (textures.front?.uvLayers?.length || 0) > 0 ||
      (textures.back?.uvLayers?.length || 0) > 0
    );
  }, [textures]);

  const hasDie = !!alphaFront || !!alphaBack;
  const hasUsableAlbedo = !!textures.front?.albedo || !!textures.back?.albedo;
  const hideBase = !!alphaFront;

  // Auto rotation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.3;
    }
  });

  // Render overlay planes with proper z-ordering
  const renderOverlayPlane = (
    side,
    textureInfo,
    zOffset,
    renderOrder,
    materialProps
  ) => {
    const isBack = side === "back";
    const positionZ = isBack
      ? -cardDimensions.thickness / 2 - zOffset
      : cardDimensions.thickness / 2 + zOffset;
    const rotation = isBack ? [0, Math.PI, 0] : [0, 0, 0];
    const isInk = materialProps && materialProps.__ink === true;
    const common = {
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    };
    return (
      <Plane
        key={`${side}-${renderOrder}`}
        args={[cardDimensions.width, cardDimensions.height]}
        position={[0, 0, positionZ]}
        rotation={rotation}
        renderOrder={renderOrder}
      >
        {isInk ? (
          <meshBasicMaterial {...common} {...materialProps} />
        ) : (
          <meshPhysicalMaterial {...common} {...materialProps} />
        )}
      </Plane>
    );
  };

  // Render effect stacks per side
  const renderEffectStacks = () => {
    const stacks = [];
    let renderOrder = 10;

    ["front", "back"].forEach((side) => {
      const isBack = side === "back";
      const sideTextures = textures[side] || {};
      const sideOffset = isBack ? 0.0001 : 0;

      // UV Layers
      (sideTextures.uvLayers || []).forEach((uvLayer, index) => {
        if (uvLayer?.maskTex) {
          stacks.push(
            renderOverlayPlane(
              side,
              uvLayer,
              sideOffset + 0.0001 + index * 0.0001,
              renderOrder++,
              {
                alphaMap: uvLayer.maskTex,
                alphaTest: 0.5,
                clearcoat: 1.0,
                clearcoatRoughness: 0.0,
                roughness: 0.02,
                metalness: 0.0,
                opacity: 0.5,
                envMapIntensity: 1.5,
              }
            )
          );
        }
      });

      // Foil Layers - Ink
      (sideTextures.foilLayers || []).forEach((foilLayer, index) => {
        if (foilLayer?.colorTex && foilLayer?.maskTex) {
          stacks.push(
            renderOverlayPlane(
              side,
              foilLayer,
              sideOffset + 0.0002 + index * 0.0001,
              renderOrder++,
              {
                __ink: true,
                map: foilLayer.colorTex,
                alphaMap: foilLayer.maskTex,
                alphaTest: 0.5,
                toneMapped: false,
              }
            )
          );
        }
      });

      // Foil Layers - Metal
      (sideTextures.foilLayers || []).forEach((foilLayer, index) => {
        if (foilLayer?.maskTex) {
          stacks.push(
            renderOverlayPlane(
              side,
              foilLayer,
              sideOffset + 0.0003 + index * 0.0001,
              renderOrder++,
              {
                alphaMap: foilLayer.maskTex,
                alphaTest: 0.5,
                metalness: 0.9,
                roughness: 0.15,
                color: new THREE.Color(0xffffff),
                envMapIntensity: 1.2,
                opacity: 0.6,
                blending: THREE.AdditiveBlending,
              }
            )
          );
        }
      });

      // Emboss/Deboss Layers
      (sideTextures.embossLayers || []).forEach((embossLayer, index) => {
        if (embossLayer?.maskTex) {
          const isDeboss = embossLayer.type === "deboss";
          stacks.push(
            renderOverlayPlane(
              side,
              embossLayer,
              sideOffset + 0.0004 + index * 0.0001,
              renderOrder++,
              {
                alphaMap: embossLayer.maskTex,
                alphaTest: 0.5,
                color: isDeboss
                  ? new THREE.Color(0x444444)
                  : new THREE.Color(0xf5f5f5),
                roughness: 0.6,
                metalness: 0.0,
              }
            )
          );
        }
      });
    });

    return stacks;
  };

  if (!cardData) {
    return <CardModelPlaceholder message="Upload a file to see 3D preview" />;
  }

  return (
    <group ref={cardRef} position={[0, 0, 0]}>
      {/* Base Card */}
      {!hideBase && <BaseCard dimensions={cardDimensions} />}

      {/* Die-Cut Front Plane (ALWAYS render when die-cut exists) */}
      {alphaFront && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0001]}
          renderOrder={4}
        >
          <meshBasicMaterial
            map={textures.front?.albedo || null}
            alphaMap={alphaFront}
            transparent={true}
            alphaTest={0.5}             // binary mask threshold
            depthWrite={false}          // avoid z-buffer artifacts
            side={THREE.DoubleSide}
            color={textures.front?.albedo ? undefined : new THREE.Color(0xf0f0f0)}
          />
        </Plane>
      )}

      {/* Albedo Planes */}
      {/* Multi-layer FRONT albedos (only if no die-cut present) */}
      {!alphaFront &&
        Array.isArray(textures.frontLayers) &&
        textures.frontLayers.length > 0 &&
        hasFrontLayerAlbedo && (
          <>
            {textures.frontLayers.map((L, i) => {
              if (!L?.albedo?.image) return null;
              const z = cardDimensions.thickness / 2 - i * 0.00005 + 0.0001;
              const hasDieCut = !!L.dieCut;
              return (
                <Plane
                  key={`front-layer-${i}`}
                  args={[cardDimensions.width, cardDimensions.height]}
                  position={[0, 0, z]}
                  renderOrder={5 + i}
                >
                  <meshBasicMaterial
                    map={L.albedo}
                    transparent={hasDieCut}
                    alphaMap={hasDieCut ? L.dieCut : undefined}
                    alphaTest={hasDieCut ? 0.5 : 0.0} // FIXED: 0.5 for binary
                    depthWrite={!hasDieCut}
                    side={THREE.DoubleSide}
                  />
                </Plane>
              );
            })}
          </>
        )}

      {/* Back albedo */}
      {textures.back?.albedo?.image && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0001]}
          rotation={[0, Math.PI, 0]}
          renderOrder={5}
        >
          <meshBasicMaterial
            map={textures.back.albedo}
            alphaMap={alphaBack || undefined}
            transparent={!!alphaBack}
            alphaTest={0.5} // FIXED: Consistent 0.5 threshold
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </Plane>
      )}

      {/* FALLBACK: single FRONT albedo (only if no die-cut) */}
      {!alphaFront &&
        (!Array.isArray(textures.frontLayers) ||
          textures.frontLayers.length === 0 ||
          !hasFrontLayerAlbedo) &&
        textures.front?.albedo?.image && (
          <Plane
            args={[cardDimensions.width, cardDimensions.height]}
            position={[0, 0, cardDimensions.thickness / 2 + 0.0001]}
            renderOrder={5}
          >
            <meshBasicMaterial
              map={textures.front.albedo}
              alphaMap={alphaFront || undefined}
              transparent={!!alphaFront}
              alphaTest={alphaFront ? 0.5 : 0.0} // FIXED: 0.5 for binary
              depthWrite={!alphaFront}
              side={THREE.DoubleSide}
            />
          </Plane>
        )}

      {/* Effect Overlay Stacks */}
      {hasTextureData && renderEffectStacks()}

      {import.meta.env.DEV && (
        <Text
          position={[0, cardDimensions.height / 2 + 0.01, 0]}
          fontSize={0.005}
          color="#ff0000"
          anchorX="center"
        >
          {`DieCut: ${alphaFront ? "LOADED" : "MISSING"}`}
        </Text>
      )}

      {/* Fallback: Item-based rendering */}
      {!hasTextureData && showEffects && (
        <>
          {(layers.print || []).map((printItem, index) => (
            <EffectOverlay
              key={`print-${index}`}
              item={printItem}
              cardDimensions={cardDimensions}
              effectType="print"
              zOffset={0.0001 + index * 0.0001}
              side={activeCard}
            />
          ))}
          {(layers.foil || []).map((foilItem, index) => (
            <EffectOverlay
              key={`foil-${index}`}
              item={foilItem}
              cardDimensions={cardDimensions}
              effectType="foil"
              zOffset={0.001 + index * 0.0002}
              side={activeCard}
            />
          ))}
          {(layers.spot_uv || []).map((uvItem, index) => (
            <EffectOverlay
              key={`uv-${index}`}
              item={uvItem}
              cardDimensions={cardDimensions}
              effectType="spot_uv"
              zOffset={0.002 + index * 0.0002}
              side={activeCard}
            />
          ))}
          {(layers.emboss || []).map((embossItem, index) => (
            <EffectOverlay
              key={`emboss-${index}`}
              item={embossItem}
              cardDimensions={cardDimensions}
              effectType="emboss"
              zOffset={0.003 + index * 0.0002}
              side={activeCard}
            />
          ))}
        </>
      )}

      {/* Loading Indicator */}
      {loadingProgress < 1 && (
        <Text
          position={[0, 0, cardDimensions.thickness / 2 + 0.002]}
          fontSize={0.005}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          Loading textures... {Math.round(loadingProgress * 100)}%
        </Text>
      )}
      

      {/* Debug Info */}
      {import.meta.env.DEV && SHOW_DEBUG_MASK && alphaFront && (
        <>
          <Plane
            args={[cardDimensions.width, cardDimensions.height]}
            position={[0, 0, cardDimensions.thickness / 2 - 0.001]} // behind front plane
            renderOrder={0}
          >
            <meshBasicMaterial map={alphaFront} transparent={true} opacity={0.6} />
          </Plane>
          <Text
            position={[0, 0.03, cardDimensions.thickness / 2 - 0.001]}
            fontSize={0.003}
            color="#ff0000"
            anchorX="center"
          >
            DEBUG: Die-cut Mask
          </Text>
        </>
      )}

      {import.meta.env.DEV && alphaBack && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.001]}
          rotation={[0, Math.PI, 0]}
          renderOrder={100}
        >
          <meshBasicMaterial
            map={alphaBack}
            transparent={false}
            side={THREE.DoubleSide}
          />
        </Plane>
      )}
      {import.meta.env.DEV && (
        <Text
          position={[0, -cardDimensions.height / 2 - 0.02, 0]}
          fontSize={0.008}
          color="#666666"
          anchorX="center"
        >
          {hasTextureData ? "Texture Mode" : "Item Mode"} | Foils:{" "}
          {(textures.front?.foilLayers?.length || 0) +
            (textures.back?.foilLayers?.length || 0)}
        </Text>
      )}
    </group>
  );
}

// Placeholder component
function CardModelPlaceholder({
  message = "Loading...",
  cardDimensions = { width: 0.089, height: 0.051, thickness: 0.00035 },
}) {
  const meshRef = useRef();
  useFrame((state) => {
    if (meshRef.current && meshRef.current.material) {
      meshRef.current.material.opacity =
        0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });
  return (
    <group>
      <BaseCard dimensions={cardDimensions} />
      <Text
        position={[0, -cardDimensions.height / 2 - 0.02, 0]}
        fontSize={0.008}
        color="#666666"
        anchorX="center"
        anchorY="middle"
      >
        {message}
      </Text>
    </group>
  );
}

export { CardModel as default, CardModelPlaceholder };

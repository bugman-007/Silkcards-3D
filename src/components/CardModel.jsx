// src/components/CardModel.jsx - FIXED VERSION
import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, Plane } from "@react-three/drei";
import * as THREE from "three";
import { getAssetUrl } from "../api/client";
import EffectOverlay from "./EffectOverlay";
import BaseCard from "./BaseCard";
import { metalness, roughness } from "three/tsl";

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
function toBinaryMaskCanvas(image) {
  if (!image) return null;

  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Estimate background from 4 corners
  const pick = (x, y) => {
    const i = (y * w + x) * 4;
    return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
  };
  const c1 = pick(0, 0),
    c2 = pick(w - 1, 0),
    c3 = pick(0, h - 1),
    c4 = pick(w - 1, h - 1);
  const bg = {
    r: (c1.r + c2.r + c3.r + c4.r) / 4,
    g: (c1.g + c2.g + c3.g + c4.g) / 4,
    b: (c1.b + c2.b + c3.b + c4.b) / 4,
    a: (c1.a + c2.a + c3.a + c4.a) / 4,
  };
  const bgTransparent = bg.a < 20;
  const rgbThresh2 = 32 * 32;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2],
      a = d[i + 3];
    let on = false;
    if (bgTransparent) {
      on = a >= 32;
    } else {
      const dr = r - bg.r,
        dg = g - bg.g,
        db = b - bg.b;
      on = dr * dr + dg * dg + db * db > rgbThresh2;
    }
    const v = on ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function CardModel({ cardData, autoRotate = false, showEffects = true }) {
  const cardRef = useRef();
  const { gl } = useThree();

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
      thickness: Math.max(0.00035, (dims.thickness || 0.35) / 1000), // ≥0.2mm
    };
  }, [cardData]);

  // NEW: Extract structured card data from adapter output - FIXED
  const cardSides = useMemo(() => {
    if (!cardData) {
      return { front: {}, back: {}, frontLayers: [], backLayers: [] };
    }

    // 1) Existing adapter shape (single per side)
    const cards = cardData?.cards || {};
    const front = cards.front || {};
    const back = cards.back || {};

    // 2) ParseResult arrays (multi-layer per side)
    const pr = cardData?.parseResult || {};
    const fc = Array.isArray(pr.front_cards) ? pr.front_cards : [];
    const bc = Array.isArray(pr.back_cards) ? pr.back_cards : [];

    // Normalize each layer record into { albedoUrl, dieCutUrl, foilLayers, uvLayers, embossLayers }
    const normLayer = (rec) => ({
      albedoUrl: rec?.albedo || rec?.print || null,
      // prefer diecut mask png if present; svg is kept for ref but renderer needs a raster mask
      dieCutUrl:
        rec?.die_png ||
        rec?.die_mask ||
        rec?.diecut_mask ||
        rec?.diecut_png ||
        null,
      foilLayers: rec?.foil
        ? [{ colorUrl: rec.foil_color || null, maskUrl: rec.foil || null }]
        : [],
      uvLayers: rec?.uv ? [{ maskUrl: rec.uv }] : [],
      embossLayers: rec?.emboss
        ? [{ maskUrl: rec.emboss, type: "emboss" }]
        : [],
    });

    const frontLayers = fc.map(normLayer);
    const backLayers = bc.map(normLayer);

    return {
      // single-side convenience (keeps Case A path intact)
      front: {
        albedoUrl: front.albedoUrl || front.albedo || front.print || null,
        dieCutUrl: front.dieCutUrl || front.die_png || front.die_mask || null,
        foilLayers: Array.isArray(front.foilLayers) ? front.foilLayers : [],
        uvLayers: Array.isArray(front.uvLayers) ? front.uvLayers : [],
        embossLayers: Array.isArray(front.embossLayers)
          ? front.embossLayers
          : [],
      },
      back: {
        albedoUrl: back.albedoUrl || back.albedo || back.print || null,
        dieCutUrl: back.dieCutUrl || back.die_png || back.die_mask || null,
        foilLayers: Array.isArray(back.foilLayers) ? back.foilLayers : [],
        uvLayers: Array.isArray(back.uvLayers) ? back.uvLayers : [],
        embossLayers: Array.isArray(back.embossLayers) ? back.embossLayers : [],
      },
      // multi-layer arrays used in Case B
      frontLayers,
      backLayers,
    };
  }, [cardData]);

  // NEW: Texture loading system for per-image overlays - FIXED
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
  });
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Early return if no jobId
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
      });
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    const normalizeRel = (jid, relPath) => {
      if (typeof relPath !== "string") return null;
      if (relPath.startsWith("assets/")) {
        const re = new RegExp(`^assets\\/${jid}\\/`);
        return relPath.replace(re, "").replace(/^assets\/[^/]+\//, "");
      }
      return relPath;
    };

    const loadTexture = (jid, relPath, isBack = false) => {
      return new Promise((resolve) => {
        if (!relPath) {
          resolve(null);
          return;
        }

        const rel = normalizeRel(jid, relPath);
        const url = getAssetUrl(jid, rel);

        loader.load(
          url,
          (tex) => {
            if (cancelled || !tex) {
              resolve(null);
              return;
            }

            tex.flipY = true; // This is correct for Three.js coordinate system
            tex.colorSpace = THREE.SRGBColorSpace;

            // FIXED: Apply proper mirroring for back side (X flip only, not Y)
            if (isBack) {
              tex.wrapS = THREE.RepeatWrapping;
              tex.repeat.x = -1; // Mirror horizontally (X-axis)
              tex.offset.x = 1; // Adjust offset for proper positioning
              // DO NOT flip Y again - tex.flipY=true is sufficient
            }

            tex.needsUpdate = true;
            resolve(tex);
          },
          undefined,
          () => resolve(null)
        );
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

    const loadSideTextures = async (sideData, isBack = false) => {
      // Load one physical layer (albedo + die + effects) → textures for that layer
      const loadLayerTextures = async (layerData, isBack = false) => {
        const layerTextures = {
          albedo: null,
          dieCut: null,
          foilLayers: [],
          uvLayers: [],
          embossLayers: [],
        };

        if (layerData?.albedoUrl) {
          layerTextures.albedo = await loadTexture(
            jobId,
            layerData.albedoUrl,
            isBack
          );
        }

        if (layerData?.dieCutUrl) {
          const dieTex = await loadTexture(jobId, layerData.dieCutUrl, isBack);
          if (dieTex?.image) {
            const maskCanvas = toBinaryMaskCanvas(dieTex.image);
            const ctx = maskCanvas.getContext("2d", {
              willReadFrequently: true,
            });
            const img = ctx.getImageData(
              0,
              0,
              maskCanvas.width,
              maskCanvas.height
            );
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
              const v = d[i];
              const inv = 255 - v; // white cut → 0 alpha
              d[i] = d[i + 1] = d[i + 2] = inv;
              d[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            const alphaTex = new THREE.CanvasTexture(maskCanvas);
            alphaTex.flipY = true;
            alphaTex.colorSpace = THREE.NoColorSpace;
            if (isBack) {
              alphaTex.wrapS = THREE.RepeatWrapping;
              alphaTex.repeat.x = -1;
              alphaTex.offset.x = 1;
            }
            alphaTex.needsUpdate = true;
            layerTextures.dieCut = alphaTex;
          }
        }

        // Foil (color + mask if available)
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

        // UV
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

        // Emboss
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

      const sideTextures = {
        albedo: null,
        dieCut: null,
        foilLayers: [],
        uvLayers: [],
        embossLayers: [],
      };

      // Load albedo
      if (sideData.albedoUrl) {
        sideTextures.albedo = await loadTexture(
          jobId,
          sideData.albedoUrl,
          isBack
        );
      }

      // Load die-cut
      if (sideData.dieCutUrl) {
        const dieTex = await loadTexture(jobId, sideData.dieCutUrl, isBack);
        if (dieTex && dieTex.image) {
          // 1) build binary mask from the die PNG
          const maskCanvas = toBinaryMaskCanvas(dieTex.image);
          // 2) invert: white (cut line) -> 0 (transparent), black (keep) -> 255 (opaque)
          const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
          const img = ctx.getImageData(
            0,
            0,
            maskCanvas.width,
            maskCanvas.height
          );
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const v = d[i]; // grayscale (0..255)
            const inv = 255 - v; // invert
            d[i] = d[i + 1] = d[i + 2] = inv;
            d[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          const alphaTex = new THREE.CanvasTexture(maskCanvas);
          alphaTex.flipY = true;
          alphaTex.colorSpace = THREE.NoColorSpace;
          if (isBack) {
            alphaTex.wrapS = THREE.RepeatWrapping;
            alphaTex.repeat.x = -1;
            alphaTex.offset.x = 1;
          }
          alphaTex.needsUpdate = true;
          sideTextures.dieCut = alphaTex; // store the **inverted** alpha
        } else {
          sideTextures.dieCut = null;
        }
      }

      // Load foil layers (color + mask)
      for (const foilLayer of sideData.foilLayers) {
        let colorTex = null,
          maskTex = null;

        if (foilLayer?.colorUrl) {
          colorTex = await loadTexture(jobId, foilLayer.colorUrl, isBack);
          if (colorTex) {
            maskTex = createMaskTexture(colorTex);
          }
        }

        // If parser provided a mask file explicitly, load it too
        if (!maskTex && foilLayer?.maskUrl) {
          const rawMask = await loadTexture(jobId, foilLayer.maskUrl, isBack);
          if (rawMask) maskTex = createMaskTexture(rawMask);
        }

        // Mirror mask if needed
        if (isBack && maskTex) {
          maskTex.wrapS = THREE.RepeatWrapping;
          maskTex.repeat.x = -1;
          maskTex.offset.x = 1;
          maskTex.needsUpdate = true;
        }

        // Push if we have at least a mask (metal highlight can render)
        if (maskTex || colorTex) {
          sideTextures.foilLayers.push({ colorTex, maskTex });
        }
      }

      // Load UV layers (mask only)
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

      // Load emboss layers (mask only)
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
            loadSideTextures(cardSides.front, false), // Case A single
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

        setTextures({
          front: frontTextures,
          back: backTextures,
          frontLayers: frontLayerTex,
          backLayers: backLayerTex,
        });

        setLoadingProgress(1);

        // if (!cancelled) {
        //   setTextures({
        //     front: frontTextures,
        //     back: backTextures,
        //   });
        // }
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
          });
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [jobId, cardSides]);

  // Check if die-cut masks are usable - FIXED
  const alphaFront = useMemo(() => {
    const l0 =
      textures.frontLayers &&
      textures.frontLayers[0] &&
      textures.frontLayers[0].dieCut;
    return l0 || textures.front?.dieCut || null;
  }, [textures.frontLayers, textures.front?.dieCut]);
  const alphaBack = useMemo(
    () => textures.back?.dieCut || null,
    [textures.back?.dieCut]
  );

  // Extract layer data for fallback rendering - FIXED
  const { layers, cardsDetected, activeCard } = useMemo(() => {
    if (!cardData) {
      return { layers: {}, cardsDetected: 0, activeCard: "front" };
    }

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

  // Check if we should use new texture system or fallback to items - FIXED
  const hasTextureData = useMemo(() => {
    return (
      textures.front?.albedo ||
      textures.back?.albedo ||
      (textures.front?.foilLayers?.length || 0) > 0 ||
      (textures.back?.foilLayers?.length || 0) > 0
    );
  }, [textures]);

  const hasDie = !!alphaFront || !!alphaBack;
  const hasUsableAlbedo = !!textures.front?.albedo || !!textures.back?.albedo;
  const hideBase = false;
  // const hideBase = hasDie && hasUsableAlbedo;

  // Auto rotation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.3;
    }
  });

  // NEW: Render overlay planes with proper z-ordering - FIXED
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

  // NEW: Render effect stacks per side - FIXED
  const renderEffectStacks = () => {
    const stacks = [];
    let renderOrder = 10; // Start after albedo

    // Render front side effects
    ["front", "back"].forEach((side) => {
      const isBack = side === "back";
      const sideTextures = textures[side] || {};
      const sideOffset = isBack ? 0.0001 : 0; // Small offset to avoid z-fighting

      // UV Layers (clear gloss)
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
                alphaTest: 0.1,
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

      // Foil Layers - Ink (unlit colors) - FIXED VERSION
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
                map: foilLayer.colorTex, // Use the original color texture
                alphaMap: foilLayer.maskTex,
                alphaTest: 0.1,
                toneMapped: false, // Preserve exact colors
                // REMOVE these physical material properties for basic material:
                // metalness: 1.0,    // ← Remove
                // roughness: 0.12,   // ← Remove
                // color: new THREE.Color(0xffffff), // ← Remove (let the texture determine color)
                // envMapIntensity: 1.8, // ← Remove
                // opacity: 0.35,     // ← Remove
                // blending: THREE.AdditiveBlending // ← Remove or change to NormalBlending
              }
            )
          );
        }
      });

      // Foil Layers - Metal (reflective highlights) - FIXED VERSION
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
                alphaTest: 0.1,
                metalness: 0.9, // Slightly reduced for better color reflection
                roughness: 0.15, // Slightly increased for more natural look
                color: new THREE.Color(0xffffff), // White base to reflect environment
                envMapIntensity: 1.2, // Reduced to let ink colors show through
                opacity: 0.6, // Increased opacity for stronger effect
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

      {/* Albedo Planes */}
      {(!textures.frontLayers || textures.frontLayers.length === 0) &&
        textures.front?.albedo && (
          <Plane
            args={[cardDimensions.width, cardDimensions.height]}
            position={[0, 0, cardDimensions.thickness / 2 + 0.0001]}
            renderOrder={5}
          >
            <meshBasicMaterial
              map={textures.front.albedo}
              alphaMap={alphaFront || undefined}
              transparent={!!alphaFront}
            />
          </Plane>
        )}

      {/* Multi-layer FRONT albedos (Case B). Layer 0 uses its dieCut; deeper layers drawn behind it */}
      {Array.isArray(textures.frontLayers) &&
        textures.frontLayers.length > 0 && (
          <>
            {textures.frontLayers.map((L, i) => {
              if (!L?.albedo) return null;
              const z = cardDimensions.thickness / 2 - i * 0.00005 + 0.0001; // tiny step into the card
              const matProps = {
                map: L.albedo,
                transparent: !!L.dieCut,
                alphaMap: L.dieCut || undefined,
                toneMapped: false,
              };
              return (
                <Plane
                  key={`front-layer-${i}`}
                  args={[cardDimensions.width, cardDimensions.height]}
                  position={[0, 0, z]}
                  renderOrder={5 + i}
                >
                  <meshBasicMaterial {...matProps} />
                </Plane>
              );
            })}
          </>
        )}

      {textures.back?.albedo && (
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
          />
        </Plane>
      )}

      {/* NEW: Effect Overlay Stacks */}
      {hasTextureData && renderEffectStacks()}

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

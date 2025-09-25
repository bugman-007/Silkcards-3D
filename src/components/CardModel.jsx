// src/components/CardModel.jsx - FIXED FOR MULTI-CARD DETECTION
import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Plane } from "@react-three/drei";
import * as THREE from "three";
import { getAssetUrl } from "../api/client";
import EffectOverlay from "./EffectOverlay";
import BaseCard from "./BaseCard";

function maskLooksFilled(tex) {
  try {
    const img = tex && tex.image;
    if (!img || !img.width || !img.height) return false;
    const w = img.width,
      h = img.height;
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
    return bright / Math.max(1, total) > 0.05; // >5% white-ish pixels = usable
  } catch {
    return false;
  }
}

function CardModel({ cardData, autoRotate = false, showEffects = true }) {
  const cardRef = useRef();

  // Extract data from the adapted structure
  const jobId = useMemo(() => {
    const pr = cardData?.parseResult || {};
    return cardData?.jobId || pr.jobId || pr.job_id || cardData?.id || null;
  }, [cardData]);

  // Get card dimensions and convert mm to meters for Three.js
  const cardDimensions = useMemo(() => {
    const dims = cardData?.dimensions ||
      cardData?.parseResult?.dimensions || {
        width: 89,
        height: 51,
        thickness: 0.35,
      };

    return {
      // Convert mm to meters for Three.js (standard practice)
      width: dims.width / 1000,
      height: dims.height / 1000,
      thickness: (dims.thickness || 0.35) / 1000,
    };
  }, [cardData]);

  // v3-aware maps flattener (supports v2 fallback)
  // CardModel.jsx — robust collector: merge ALL front/back entries and normalize by filename
  const maps = useMemo(() => {
    const pr = cardData?.parseResult || {};
    const base = pr.maps || cardData?.maps || {};

    // Normalize a single value to a string path (ignore null/objects)
    const asStr = (v) => (typeof v === "string" ? v : null);

    // Harvest one side by scanning every entry and every key, matching by FILENAME.
    const harvestSide = (side) => {
      const arr = Array.isArray(base?.[`${side}_cards`])
        ? base[`${side}_cards`]
        : [];
      const got = {
        albedo: null,
        uv: null,
        foil: null,
        emboss: null,
        die_png: null,
      };

      // Prefer albedo-bearing entry to anchor albedo; effects can come from ANY entry.
      for (let pass = 0; pass < 2; pass++) {
        for (const c of arr) {
          const m = c && c.maps ? c.maps : {};
          for (const [k, raw] of Object.entries(m)) {
            const p = asStr(raw);
            if (!p) continue;

            const file = p.split("/").pop().toLowerCase();
            const isFront = file.startsWith("front_"); // guard against cross-side miswires
            const isBack = file.startsWith("back_");

            if (side === "front" && !isFront) continue;
            if (side === "back" && !isBack) continue;

            // albedo (only on pass 0 to anchor the main print)
            if (pass === 0 && !got.albedo && /_albedo\.png$/.test(file)) {
              got.albedo = p;
            }

            // effects (any pass, fill first missing)
            if (!got.uv && /(spot[-_]?uv|_uv)\.png$/.test(file)) got.uv = p;
            if (!got.foil && /_foil.*\.png$/.test(file)) got.foil = p;
            if (!got.emboss && /_(emboss|deboss).*\.png$/.test(file))
              got.emboss = p;
            if (
              !got.die_png &&
              /(diecut.*mask|_die(_|$)|laser[-_]?cut).*\.png$/.test(file)
            )
              got.die_png = p;
          }
        }
      }

      // If we never found albedo but have effects, still return effects so overlays can render.
      return Object.values(got).some(Boolean) ? got : null;
    };

    const out = {};
    const front = harvestSide("front");
    const back = harvestSide("back");

    const push = (side, m) => {
      if (!m) return;
      if (m.albedo) out[`albedo_${side}`] = m.albedo;
      if (m.uv) out[`uv_${side}`] = m.uv;
      if (m.foil) out[`foil_${side}`] = m.foil;
      if (m.emboss) out[`emboss_${side}`] = m.emboss;
      if (m.die_png) out[`die_${side}`] = m.die_png;
    };

    if (front || back) {
      push("front", front);
      push("back", back);
      return out;
    }

    // v2 fallback: scan any top-level maps.front/back by filename as well
    const scanLoose = (side, m) => {
      if (!m) return null;
      const got = {
        albedo: null,
        uv: null,
        foil: null,
        emboss: null,
        die_png: null,
      };
      for (const [, raw] of Object.entries(m)) {
        const p = asStr(raw);
        if (!p) continue;
        const file = p.split("/").pop().toLowerCase();
        const isFront = file.startsWith("front_");
        const isBack = file.startsWith("back_");
        if (side === "front" && !isFront) continue;
        if (side === "back" && !isBack) continue;

        if (!got.albedo && /_albedo\.png$/.test(file)) got.albedo = p;
        if (!got.uv && /(spot[-_]?uv|_uv)\.png$/.test(file)) got.uv = p;
        if (!got.foil && /_foil.*\.png$/.test(file)) got.foil = p;
        if (!got.emboss && /_(emboss|deboss).*\.png$/.test(file))
          got.emboss = p;
        if (
          !got.die_png &&
          /(diecut.*mask|_die(_|$)|laser[-_]?cut).*\.png$/.test(file)
        )
          got.die_png = p;
      }
      return Object.values(got).some(Boolean) ? got : null;
    };

    const f2 = scanLoose("front", base.front);
    const b2 = scanLoose("back", base.back);
    if (f2 || b2) {
      const o2 = {};
      if (f2) push("front", f2);
      if (b2) push("back", b2);
      return out;
    }

    return out; // empty
  }, [cardData]);

  const [textures, setTextures] = useState({});
  const [texLoading, setTexLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    const normalizeRel = (jid, relPath) => {
      if (typeof relPath === "string" && relPath.startsWith("assets/")) {
        const re = new RegExp(`^assets\\/${jid}\\/`);
        return relPath.replace(re, "").replace(/^assets\/[^/]+\//, "");
      }
      return relPath;
    };

    // turn any colored PNG into a hard white-on-black mask (keeps edges crisp)
    function toBinaryMaskCanvas(image) {
      const w = image.naturalWidth || image.width;
      const h = image.naturalHeight || image.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);

      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;

      // estimate background from 4 corners
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
          on = a >= 32; // use alpha when the artboard is transparent
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

    const loadOne = (jid, relPath, key) =>
      new Promise((resolve) => {
        const rel = normalizeRel(jid, relPath);
        const url = getAssetUrl(jid, rel);

        loader.load(
          url,
          (tex) => {
            if (!tex || !tex.isTexture) return resolve(null);

            const isEffect = /_(?:uv|spot_uv|foil|emboss)_(front|back)$/.test(
              key
            );
            const isDie = /^die_/.test(key);

            // orientation + color space
            tex.flipY = true;
            tex.colorSpace = isDie ? THREE.NoColorSpace : THREE.SRGBColorSpace;
            tex.needsUpdate = true;

            if (key === "albedo_back") {
              // mirror the back so text isn't reversed
              tex.wrapS = THREE.RepeatWrapping;
              tex.repeat.x = -1;
              tex.offset.x = 1;
            }

            if (!isEffect) {
              return resolve({ kind: "plain", tex });
            }

            // EFFECT: keep the source colors (for 'map') and build a hard mask (for 'alphaMap')
            const colorTex = tex; // use PNG’s real colors (no tint)
            let maskTex;
            try {
              const maskCanvas = toBinaryMaskCanvas(colorTex.image);
              maskTex = new THREE.CanvasTexture(maskCanvas);
            } catch {
              maskTex = colorTex.clone();
            }
            maskTex.flipY = true;
            maskTex.colorSpace = THREE.NoColorSpace;
            maskTex.needsUpdate = true;

            resolve({ kind: "effect", color: colorTex, mask: maskTex });
          },
          undefined,
          () => resolve(null)
        );
      });

    const run = async () => {
      const entries = Object.entries(maps).filter(
        ([, v]) => typeof v === "string"
      );
      if (!entries.length) {
        if (!cancelled) setTextures({});
        return;
      }

      const pairs = await Promise.all(
        entries.map(async ([k, rel]) => [k, await loadOne(jobId, rel, k)])
      );

      // normalize into one flat dictionary the materials expect
      const out = {};
      for (const [k, val] of pairs) {
        if (!val) continue;
        if (val.kind === "plain") {
          out[k] = val.tex; // e.g., albedo_front/back, die_front/back
          continue;
        }
        if (val.kind === "effect") {
          // k is like 'foil_front' or 'uv_back'
          out[k] = val.mask; // <- alphaMap
          out[`${k}_color`] = val.color; // <- map (actual PNG colors)
        }
      }

      if (!cancelled) setTextures(out); // <-- keep the normalized object ONLY
    };

    if (!jobId || !maps || !Object.keys(maps).length) {
      setTextures({});
      return;
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [jobId, maps]);

  const alphaFront = useMemo(() => {
    const t = textures.die_front;
    return t && maskLooksFilled(t) ? t : null;
  }, [textures.die_front]);

  const alphaBack = useMemo(() => {
    const t = textures.die_back;
    return t && maskLooksFilled(t) ? t : null;
  }, [textures.die_back]);

  // Extract layer data - handle multiple cards
  const { layers, cardsDetected, activeCard } = useMemo(() => {
    const cards = cardData?.cards || {};
    const layers = cardData?.layers || {};

    // If we have multiple cards detected, show the first one
    const cardKeys = Object.keys(cards);
    let activeCardData = layers;
    let activeCardKey = "primary";

    if (cardKeys.length > 0) {
      // Prefer 'front' card, otherwise take first card
      activeCardKey = cardKeys.includes("front") ? "front" : cardKeys[0];
      activeCardData = cards[activeCardKey] || {};
    }

    return {
      layers: activeCardData,
      cardsDetected: cardKeys.length,
      activeCard: activeCardKey,
    };
  }, [cardData]);

  // Get original file name for debugging
  const originalFileName = useMemo(() => {
    return (
      cardData?.parseResult?.metadata?.originalFile ||
      cardData?.file?.name ||
      "Business Card"
    );
  }, [cardData]);

  // Count total effect items for logging
  const totalEffects = useMemo(() => {
    return Object.values(layers).reduce(
      (total, items) => total + (Array.isArray(items) ? items.length : 0),
      0
    );
  }, [layers]);

  console.log("CardModel rendering:", {
    hasJobId: !!jobId,
    fileName: originalFileName,
    dimensions: cardDimensions,
    layerTypes: Object.keys(layers),
    totalEffects: totalEffects,
    cardsDetected: cardsDetected,
    activeCard: activeCard,
  });

  // Auto rotation animation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.3;
    }
  });

  // Show placeholder if no card data
  if (!cardData) {
    return <CardModelPlaceholder message="Upload a file to see 3D preview" />;
  }
  const hasDie = !!alphaFront || !!alphaBack;
  const hasUsableAlbedo = !!textures.albedo_front || !!textures.albedo_back;
  const hideBase = hasDie && hasUsableAlbedo;

  // ...

  {
    /* Base Card */
  }
  {
    !hideBase && <BaseCard dimensions={cardDimensions} />;
  }

  return (
    <group ref={cardRef} position={[0, 0, 0]}>
      {/* Base Card */}
      {!hideBase && <BaseCard dimensions={cardDimensions} />}

      {/* Albedo planes (front/back) */}
      {textures.albedo_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0004]}
        >
          <meshBasicMaterial
            map={textures.albedo_front}
            alphaMap={alphaFront || undefined}
            transparent={!!alphaFront}
          />
        </Plane>
      )}
      {textures.albedo_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0004]}
          rotation={[0, Math.PI, 0]}
        >
          <meshBasicMaterial
            map={textures.albedo_back}
            alphaMap={alphaBack || undefined}
            transparent={!!alphaBack}
          />
        </Plane>
      )}

      {/* Effect mask overlays (front) */}
      {textures.foil_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0006]}
          renderOrder={10} // ✅ draw after albedo
        >
          <meshPhysicalMaterial
            transparent
            depthTest
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            map={textures.foil_front_color} // ← actual PNG colors (cyan/magenta)
            alphaMap={textures.foil_front} // ← binary mask
            alphaTest={0.1}
            metalness={1.0}
            roughness={0.2}
            envMapIntensity={2.0}
          />
        </Plane>
      )}
      {textures.uv_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0007]}
          renderOrder={11} // ✅ above foil
        >
          <meshPhysicalMaterial
            transparent
            depthTest
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            alphaMap={textures.uv_front} // mask only
            alphaTest={0.1}
            // Keep UV *clear*; no color tint
            metalness={0}
            roughness={0.04}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
            envMapIntensity={1.5}
            opacity={0.18}
          />
        </Plane>
      )}
      {textures.emboss_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0008]}
        >
          <meshPhysicalMaterial
            transparent
            depthTest
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            alphaMap={textures.emboss_front}
            alphaTest={0.5}
            color={"#eeeeee"}
            metalness={0}
            roughness={0.6}
          />
        </Plane>
      )}
      {textures.foil_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0006]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            color={"#B87333"} // tweak if you carry foil color in manifest
            metalness={1.0}
            roughness={0.2}
            transparent
            alphaMap={textures.foil_back}
            alphaTest={0.5}
          />
        </Plane>
      )}
      {textures.uv_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0007]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            color={"#ffffff"}
            metalness={0.0}
            roughness={0.05}
            transparent
            alphaMap={textures.uv_back}
            alphaTest={0.5}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
          />
        </Plane>
      )}
      {textures.emboss_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0008]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            color={"#f0f0f0"}
            metalness={0.0}
            roughness={0.6}
            transparent
            alphaMap={textures.emboss_back}
            alphaTest={0.5}
          />
        </Plane>
      )}

      {/* Fallback rectangles (only if no texture maps) */}
      {showEffects && !Object.keys(textures).length && (
        <>
          {layers.print?.map((printItem, index) => (
            <EffectOverlay
              key={`print-${index}`}
              item={printItem}
              cardDimensions={cardDimensions}
              effectType="print"
              zOffset={0.0001 + index * 0.0001}
            />
          ))}
          {layers.foil?.map((foilItem, index) => (
            <EffectOverlay
              key={`foil-${index}`}
              item={foilItem}
              cardDimensions={cardDimensions}
              effectType="foil"
              zOffset={0.001 + index * 0.0002}
            />
          ))}
          {layers.spot_uv?.map((uvItem, index) => (
            <EffectOverlay
              key={`uv-${index}`}
              item={uvItem}
              cardDimensions={cardDimensions}
              effectType="spot_uv"
              zOffset={0.002 + index * 0.0002}
            />
          ))}
          {layers.emboss?.map((embossItem, index) => (
            <EffectOverlay
              key={`emboss-${index}`}
              item={embossItem}
              cardDimensions={cardDimensions}
              effectType="emboss"
              zOffset={0.003 + index * 0.0002}
            />
          ))}
          {layers.die_cut?.map((dieItem, index) => (
            <EffectOverlay
              key={`die-${index}`}
              item={dieItem}
              cardDimensions={cardDimensions}
              effectType="die_cut"
              zOffset={0.004 + index * 0.0002}
            />
          ))}
        </>
      )}

      {/* Debug info (only in development) */}
      {import.meta.env.DEV && (
        <Text
          position={[0, -cardDimensions.height / 2 - 0.02, 0]}
          fontSize={0.008}
          color="#666666"
          anchorX="center"
        >
          {cardsDetected > 1
            ? `Card: ${activeCard} (${cardsDetected} detected)`
            : `Effects: ${totalEffects}`}
        </Text>
      )}

      {/* Show message when no effects are found */}
      {totalEffects === 0 && (
        <Text
          position={[0, 0, cardDimensions.thickness / 2 + 0.001]}
          fontSize={0.005}
          color="#999999"
          anchorX="center"
          anchorY="middle"
        >
          No effects detected in {activeCard} card
        </Text>
      )}

      {/* Show multi-card indicator */}
      {cardsDetected > 1 && (
        <Text
          position={[0, cardDimensions.height / 2 + 0.01, 0]}
          fontSize={0.006}
          color="#667eea"
          anchorX="center"
        >
          Showing: {activeCard} card ({cardsDetected} cards detected)
        </Text>
      )}
    </group>
  );
}

// Simple placeholder component for loading states
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
      {!hideBase && <BaseCard dimensions={cardDimensions} />}
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

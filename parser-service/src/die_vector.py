"""
Die vector extraction module for parser-service.
Optional: Extract die spot from PDF to vector SVG using pdfToolbox or PitStop.
"""

import subprocess
import logging
from pathlib import Path
from typing import Optional

from . import config

logger = logging.getLogger("parser.die_vector")


class DieVectorError(Exception):
    """Base exception for die vector operations."""
    pass


class DieVectorExtractor:
    """
    Handles vector die extraction from PDF spot plates.
    Requires callas pdfToolbox CLI or PitStop CLI (optional).
    """
    
    def __init__(self, pdftoolbox_exe: Optional[str] = None):
        """
        Initialize die vector extractor.
        
        Args:
            pdftoolbox_exe: Path to pdfToolbox CLI (auto-detects if None)
        """
        if pdftoolbox_exe:
            self.pdftoolbox_exe = pdftoolbox_exe
        else:
            self.pdftoolbox_exe = config.get_pdftoolbox_path()
        
        if self.pdftoolbox_exe:
            logger.info(f"Using pdfToolbox: {self.pdftoolbox_exe}")
        else:
            logger.warning("pdfToolbox not found; die vector extraction unavailable")
    
    def is_available(self) -> bool:
        """
        Check if die vector extraction is available.
        
        Returns:
            True if pdfToolbox is available
        """
        return self.pdftoolbox_exe is not None
    
    def extract_die_spot_to_svg(self, pdf_path: Path, output_svg: Path, 
                                spot_name: str = "DIE") -> bool:
        """
        Extract a specific spot color from PDF to vector SVG.
        
        Args:
            pdf_path: Input PDF with spot colors
            output_svg: Output SVG path
            spot_name: Name of spot to extract (default: "DIE")
            
        Returns:
            True if extraction succeeded
            
        Raises:
            DieVectorError: If extraction fails
        """
        if not self.is_available():
            raise DieVectorError("pdfToolbox not available")
        
        if not pdf_path.exists():
            raise DieVectorError(f"PDF not found: {pdf_path}")
        
        logger.info(f"Extracting spot '{spot_name}' from {pdf_path}")
        
        # Create intermediate PDF with only DIE spot
        temp_pdf = pdf_path.parent / f"{pdf_path.stem}_die_only.pdf"
        
        try:
            # Step 1: Use pdfToolbox to isolate DIE spot
            # (This is a placeholder; actual pdfToolbox commands vary by version)
            # Example command (adjust based on your pdfToolbox CLI syntax):
            # pdfToolbox --isolate-spot="DIE" input.pdf output.pdf
            
            self._isolate_spot_with_pdftoolbox(pdf_path, temp_pdf, spot_name)
            
            # Step 2: Convert isolated PDF to SVG
            # Option A: Use pdfToolbox's SVG export (if available)
            # Option B: Use Ghostscript with svg device
            # Option C: Use Inkscape CLI
            
            self._convert_pdf_to_svg(temp_pdf, output_svg)
            
            # Cleanup
            if temp_pdf.exists():
                temp_pdf.unlink()
            
            logger.info(f"Extracted die vector: {output_svg}")
            return True
        
        except Exception as e:
            logger.error(f"Die vector extraction failed: {e}")
            if temp_pdf.exists():
                temp_pdf.unlink()
            raise DieVectorError(f"Failed to extract die vector: {e}")
    
    def _isolate_spot_with_pdftoolbox(self, input_pdf: Path, output_pdf: Path, 
                                      spot_name: str):
        """
        Isolate a specific spot color using pdfToolbox.
        
        Note: This is a placeholder. Actual implementation depends on your
        pdfToolbox version and license.
        """
        # Example pdfToolbox command (syntax varies by version):
        # pdfToolbox --profile="Isolate_Spot" --spot-name="DIE" input.pdf output.pdf
        
        # For now, we'll use a simple approach: just copy the PDF
        # In production, you'd use pdfToolbox's actual API/CLI
        
        logger.warning("pdfToolbox spot isolation not implemented; using fallback")
        
        # Fallback: Copy PDF as-is
        # (Real implementation would use pdfToolbox CLI with appropriate profile)
        import shutil
        shutil.copy(input_pdf, output_pdf)
    
    def _convert_pdf_to_svg(self, pdf_path: Path, svg_path: Path):
        """
        Convert PDF to SVG.
        
        Uses Ghostscript with svg device as fallback.
        """
        # Try Ghostscript with svg device
        try:
            gs_exe = config.get_ghostscript_path()
        except FileNotFoundError:
            raise DieVectorError("Cannot convert to SVG: Ghostscript not found")
        
        cmd = [
            gs_exe,
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            "-sDEVICE=svg",
            f"-sOutputFile={svg_path}",
            str(pdf_path)
        ]
        
        logger.debug(f"Converting PDF to SVG: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60, text=True)
            
            if result.returncode != 0:
                raise DieVectorError(
                    f"SVG conversion failed: {result.stderr}"
                )
            
            logger.info(f"Converted to SVG: {svg_path}")
        
        except subprocess.TimeoutExpired:
            raise DieVectorError("SVG conversion timed out")
        except Exception as e:
            raise DieVectorError(f"SVG conversion failed: {e}")
    
    def validate_die_svg_alignment(self, svg_path: Path, mask_png: Path, 
                                   tolerance_px: int = None) -> bool:
        """
        Validate that die SVG bounds align with die mask PNG.
        
        Args:
            svg_path: Path to die SVG
            mask_png: Path to die mask PNG
            tolerance_px: Alignment tolerance in pixels (uses config default if None)
            
        Returns:
            True if alignment is within tolerance
        """
        if tolerance_px is None:
            tolerance_px = config.DIE_ALIGNMENT_TOLERANCE_PX
        
        if not svg_path.exists() or not mask_png.exists():
            logger.warning("Cannot validate alignment: files not found")
            return False
        
        try:
            # Get SVG bounds
            svg_bounds = self._get_svg_bounds(svg_path)
            
            # Get PNG bounds (non-transparent area)
            png_bounds = self._get_png_content_bounds(mask_png)
            
            # Compare bounds with tolerance
            dx = abs(svg_bounds[0] - png_bounds[0])
            dy = abs(svg_bounds[1] - png_bounds[1])
            dw = abs(svg_bounds[2] - png_bounds[2])
            dh = abs(svg_bounds[3] - png_bounds[3])
            
            max_diff = max(dx, dy, dw, dh)
            
            if max_diff > tolerance_px:
                logger.warning(
                    f"Die SVG/mask misalignment: {max_diff}px > {tolerance_px}px tolerance"
                )
                return False
            
            logger.info(f"Die SVG/mask alignment OK (max diff: {max_diff}px)")
            return True
        
        except Exception as e:
            logger.error(f"Cannot validate alignment: {e}")
            return False
    
    def _get_svg_bounds(self, svg_path: Path) -> tuple:
        """
        Get SVG viewBox or content bounds.
        
        Returns:
            Tuple of (x, y, width, height)
        """
        import xml.etree.ElementTree as ET
        
        tree = ET.parse(svg_path)
        root = tree.getroot()
        
        # Try to get viewBox
        viewbox = root.attrib.get('viewBox')
        if viewbox:
            parts = viewbox.split()
            return tuple(float(p) for p in parts)
        
        # Fallback: try width/height
        width = root.attrib.get('width', '0')
        height = root.attrib.get('height', '0')
        
        # Parse width/height (may have units)
        import re
        width_num = float(re.findall(r'[\d.]+', width)[0]) if re.findall(r'[\d.]+', width) else 0
        height_num = float(re.findall(r'[\d.]+', height)[0]) if re.findall(r'[\d.]+', height) else 0
        
        return (0, 0, width_num, height_num)
    
    def _get_png_content_bounds(self, png_path: Path) -> tuple:
        """
        Get bounds of non-transparent content in PNG.
        
        Returns:
            Tuple of (x, y, width, height) in pixels
        """
        from PIL import Image
        import numpy as np
        
        img = Image.open(png_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        arr = np.array(img)
        alpha = arr[:, :, 3]
        
        # Find non-transparent pixels
        rows = np.any(alpha > 0, axis=1)
        cols = np.any(alpha > 0, axis=0)
        
        if not rows.any() or not cols.any():
            return (0, 0, 0, 0)
        
        y_min, y_max = np.where(rows)[0][[0, -1]]
        x_min, x_max = np.where(cols)[0][[0, -1]]
        
        width = x_max - x_min + 1
        height = y_max - y_min + 1
        
        return (x_min, y_min, width, height)


def extract_die_vector(pdf_path: Path, output_svg: Path) -> bool:
    """
    Convenience function to extract die vector from PDF.
    
    Args:
        pdf_path: Input PDF with DIE spot
        output_svg: Output SVG path
        
    Returns:
        True if extraction succeeded, False if pdfToolbox not available
        
    Raises:
        DieVectorError: If extraction fails
    """
    extractor = DieVectorExtractor()
    
    if not extractor.is_available():
        logger.info("Die vector extraction skipped (pdfToolbox not available)")
        return False
    
    return extractor.extract_die_spot_to_svg(pdf_path, output_svg)

